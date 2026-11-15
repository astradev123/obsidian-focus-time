import { FileStore } from "./fileStore";
import { archivePath, eventsPath, monthKey, monthKeyFromDate, shardPath, SHARD_PATTERN } from "./paths";
import { FocusEvent } from "./types";

export function newEventId(prefix = "e"): string {
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function isFocusEvent(value: unknown): value is FocusEvent {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as { v?: number; id?: string; type?: string };
	return candidate.v === 1 && typeof candidate.id === "string" && typeof candidate.type === "string";
}

/**
 * Append-only event storage.
 *
 * Events are first appended to a device-local WAL, then published to monthly
 * shards inside the vault. Two devices never write the same file, so write
 * conflicts cannot happen by construction.
 */
export class EventStore {
	private queue: Promise<void> = Promise.resolve();

	constructor(
		private readonly files: FileStore,
		private readonly deviceId: string,
		private readonly walPath: string
	) {}

	public async record(event: FocusEvent): Promise<void> {
		const line = `${JSON.stringify(event)}\n`;
		this.queue = this.queue
			.catch(() => undefined)
			.then(() => this.files.append(this.walPath, line));
		await this.queue;
	}

	public async appendBatch(events: FocusEvent[]): Promise<number> {
		const groups = new Map<string, string[]>();
		for (const event of events) {
			const month = this.eventMonth(event);
			const lines = groups.get(month) ?? [];
			lines.push(JSON.stringify(event));
			groups.set(month, lines);
		}

		for (const [month, lines] of groups) {
			const path = shardPath(month, this.deviceId);
			if (await this.files.exists(path)) {
				const existing = await this.files.read(path);
				if (existing.length > 0 && !existing.endsWith("\n")) {
					await this.files.append(path, "\n");
				}
			}
			await this.files.append(path, lines.join("\n") + "\n");
		}
		return events.length;
	}

	/**
	 * Move WAL entries into monthly shards. Duplicate ids are harmless: reads
	 * dedupe by id, so a crash between append and clear only costs a re-read.
	 */
	public async publish(): Promise<number> {
		const content = await this.files.readOrEmpty(this.walPath);
		if (!content.trim()) {
			return 0;
		}

		const events: FocusEvent[] = [];
		for (const line of content.split("\n")) {
			if (!line.trim()) {
				continue;
			}
			try {
				const parsed = JSON.parse(line) as unknown;
				if (isFocusEvent(parsed)) {
					events.push(parsed);
				}
			} catch {
				// A power loss can leave one torn line; skip it.
			}
		}

		if (events.length === 0) {
			await this.files.write(this.walPath, "");
			return 0;
		}

		await this.appendBatch(events);
		await this.files.write(this.walPath, "");
		return events.length;
	}

	public async readAll(): Promise<FocusEvent[]> {
		const paths = await this.files.listFiles(eventsPath());
		const seen = new Set<string>();
		const events: FocusEvent[] = [];

		for (const path of paths) {
			if (!path.endsWith(".jsonl")) {
				continue;
			}
			const content = await this.files.readOrEmpty(path);
			for (const line of content.split("\n")) {
				if (!line.trim()) {
					continue;
				}
				try {
					const parsed = JSON.parse(line) as unknown;
					if (!isFocusEvent(parsed) || seen.has(parsed.id)) {
						continue;
					}
					seen.add(parsed.id);
					events.push(parsed);
				} catch {
					// Ignore torn lines.
				}
			}
		}

		events.sort((a, b) => {
			const aStart = a.type === "session" ? a.start : a.at;
			const bStart = b.type === "session" ? b.start : b.at;
			return aStart - bStart;
		});
		return events;
	}

	/**
	 * Import provider-specific conflict copies, then move them out of the event
	 * directory so they are not imported twice.
	 */
	public async archiveConflicts(): Promise<number> {
		const dir = eventsPath();
		const files = await this.files.listFiles(dir);
		let imported = 0;

		for (const path of files) {
			const name = path.split("/").pop() ?? "";
			if (!name.endsWith(".jsonl") || SHARD_PATTERN.test(name)) {
				continue;
			}

			const content = await this.files.readOrEmpty(path);
			const events: FocusEvent[] = [];
			for (const line of content.split("\n")) {
				if (!line.trim()) {
					continue;
				}
				try {
					const parsed = JSON.parse(line) as unknown;
					if (isFocusEvent(parsed)) {
						events.push(parsed);
					}
				} catch {
					// Ignore.
				}
			}

			if (events.length > 0) {
				await this.appendBatch(events);
				imported += events.length;
			}

			const target = archivePath("conflicts", `${name}.${Date.now()}`);
			try {
				await this.files.move(path, target);
			} catch {
				await this.files.remove(path);
			}
		}

		return imported;
	}

	private eventMonth(event: FocusEvent): string {
		if (event.type === "session") {
			return monthKey(event.start);
		}
		if (event.type === "legacyDay") {
			return monthKeyFromDate(event.date);
		}
		return monthKey(event.at);
	}
}
