import { App, Plugin } from "obsidian";

export interface NormalizationReport {
	convertedIds: number;
	repairedDuplicates: number;
	repairedRecords: number;
}

interface ReadRecordLike {
	fileId?: string;
	id?: string;
	filePath?: string;
	duration?: number;
	openCount?: number;
	[key: string]: unknown;
}

const SAVE_DELAY_MS = 30_000;

/**
 * In-memory owner of `data.json`.
 *
 * The old implementation re-read the whole file before every write, then wrote
 * it back on every 6-second tick. This version keeps the data in memory, marks
 * it dirty, and coalesces disk writes. Settings can still force an immediate
 * save.
 */
export class PluginDataManager {
	private data: Record<string, unknown> = {};
	private loaded = false;
	private loadPromise: Promise<void> | null = null;
	private saveTimer: number | null = null;
	private dirty = false;
	private readonly pathByFileId = new Map<string, string>();

	constructor(private readonly plugin: Plugin) {}

	public async loadData(): Promise<void> {
		if (this.loaded) {
			return;
		}
		if (this.loadPromise) {
			return this.loadPromise;
		}

		this.loadPromise = (async () => {
			const loaded = await this.plugin.loadData();
			this.data = loaded && typeof loaded === "object" ? (loaded as Record<string, unknown>) : {};
			this.loaded = true;
			this.rebuildIndex();
		})();

		try {
			await this.loadPromise;
		} finally {
			this.loadPromise = null;
		}
	}

	/**
	 * Merge changes written by another device without lowering any local totals.
	 * v0 storage is still last-write-wins on disk; this only prevents the most
	 * common regression (a stale device overwriting a larger duration).
	 */
	public async mergeFromDisk(): Promise<void> {
		const loaded = await this.plugin.loadData();
		if (!loaded || typeof loaded !== "object") {
			return;
		}

		const remote = loaded as Record<string, unknown>;
		const remoteRead = (remote.readData ?? {}) as Record<string, ReadRecordLike>;
		const localRead = (this.data.readData ?? {}) as Record<string, ReadRecordLike>;
		const merged: Record<string, ReadRecordLike> = {};

		for (const path of new Set([...Object.keys(localRead), ...Object.keys(remoteRead)])) {
			const local = localRead[path];
			const incoming = remoteRead[path];

			if (!local) {
				merged[path] = incoming;
				continue;
			}
			if (!incoming) {
				merged[path] = local;
				continue;
			}

			merged[path] = {
				...incoming,
				...local,
				fileId: local.fileId || incoming.fileId,
				filePath: local.filePath || incoming.filePath || path,
				duration: Math.max(Number(local.duration) || 0, Number(incoming.duration) || 0),
				openCount: Math.max(Number(local.openCount) || 0, Number(incoming.openCount) || 0)
			};
		}

		this.data.readData = merged;
		const remoteSettings = (remote.settings ?? {}) as Record<string, unknown>;
		const localSettings = (this.data.settings ?? {}) as Record<string, unknown>;
		this.data.settings = { ...remoteSettings, ...localSettings };
		this.rebuildIndex();
	}

	public async put(
		category: string,
		key: string,
		value: unknown,
		options: { immediate?: boolean } = {}
	): Promise<void> {
		await this.loadData();
		const bucket = (this.data[category] as Record<string, unknown> | undefined) ?? {};
		bucket[key] = value;
		this.data[category] = bucket;

		if (category === "readData") {
			this.rebuildIndex();
		}
		await this.markDirty(options.immediate === true);
	}

	public get(category: string, key?: string): unknown {
		const bucket = this.data[category];
		if (key === undefined) {
			return bucket;
		}
		return bucket && typeof bucket === "object" ? (bucket as Record<string, unknown>)[key] : undefined;
	}

	public getCategory(category: string): Record<string, unknown> | undefined {
		const bucket = this.data[category];
		return bucket && typeof bucket === "object" ? (bucket as Record<string, unknown>) : undefined;
	}

	public async delete(category: string, key: string): Promise<void> {
		await this.loadData();
		const bucket = this.data[category] as Record<string, unknown> | undefined;
		if (!bucket || !(key in bucket)) {
			return;
		}
		delete bucket[key];
		if (category === "readData") {
			this.rebuildIndex();
		}
		await this.markDirty(false);
	}

	public async deleteCategory(category: string): Promise<void> {
		await this.loadData();
		if (!(category in this.data)) {
			return;
		}
		delete this.data[category];
		if (category === "readData") {
			this.rebuildIndex();
		}
		await this.markDirty(false);
	}

	/**
	 * Ensure a note has a stable id before any daily record is written.
	 * This removes the historical `"undefined"` key problem.
	 */
	public async ensureNote(filePath: string): Promise<string> {
		await this.loadData();
		const existing = this.get("readData", filePath) as ReadRecordLike | undefined;
		if (existing && existing.fileId) {
			return existing.fileId;
		}

		const fileId = this.generateNoteId();
		await this.put("readData", filePath, {
			fileId,
			filePath,
			duration: Number(existing?.duration) || 0,
			openCount: Number(existing?.openCount) || 0
		});
		return fileId;
	}

	public async addDuration(filePath: string, fileId: string, ms: number): Promise<void> {
		if (!Number.isFinite(ms) || ms <= 0) {
			return;
		}
		await this.loadData();
		const record = this.get("readData", filePath) as ReadRecordLike | undefined;

		if (!record) {
			await this.put("readData", filePath, {
				fileId,
				filePath,
				duration: ms,
				openCount: 0
			});
			return;
		}

		record.fileId = record.fileId || fileId;
		record.filePath = record.filePath || filePath;
		record.duration = (Number(record.duration) || 0) + ms;
		this.rebuildIndex();
		await this.markDirty(false);
	}

	public async incrementOpenCount(filePath: string): Promise<void> {
		await this.loadData();
		const record = this.get("readData", filePath) as ReadRecordLike | undefined;
		if (!record) {
			await this.ensureNote(filePath);
			await this.incrementOpenCount(filePath);
			return;
		}
		record.openCount = (Number(record.openCount) || 0) + 1;
		await this.markDirty(false);
	}

	public getPathByFileId(fileId: string): string | undefined {
		return this.pathByFileId.get(fileId);
	}

	/**
	 * One-time compatibility pass for v0 data:
	 * - `id` -> `fileId`
	 * - fill missing `filePath`
	 * - coerce numbers
	 * - split duplicate file ids so future writes stay unambiguous
	 */
	public async normalizeLegacyData(app?: App): Promise<NormalizationReport> {
		await this.loadData();
		const report: NormalizationReport = { convertedIds: 0, repairedDuplicates: 0, repairedRecords: 0 };
		const readData = this.data.readData as Record<string, ReadRecordLike> | undefined;
		if (!readData || typeof readData !== "object") {
			return report;
		}

		const idToPaths = new Map<string, string[]>();
		let changed = false;

		for (const path of Object.keys(readData)) {
			const record = readData[path];
			if (!record || typeof record !== "object") {
				readData[path] = {
					fileId: this.generateNoteId(),
					filePath: path,
					duration: 0,
					openCount: 0
				};
				report.repairedRecords++;
				changed = true;
				continue;
			}

			let recordChanged = false;

			if (!record.fileId && record.id) {
				record.fileId = String(record.id);
				report.convertedIds++;
				recordChanged = true;
			}
			if (!record.fileId) {
				record.fileId = this.generateNoteId();
				report.repairedRecords++;
				recordChanged = true;
			}
			if (!record.filePath) {
				record.filePath = path;
				recordChanged = true;
			}
			if (typeof record.duration !== "number" || !Number.isFinite(record.duration)) {
				record.duration = Number(record.duration) || 0;
				recordChanged = true;
			}
			if (typeof record.openCount !== "number" || !Number.isFinite(record.openCount)) {
				record.openCount = Number(record.openCount) || 0;
				recordChanged = true;
			}
			if (record.id !== undefined) {
				delete record.id;
				recordChanged = true;
			}

			if (recordChanged) {
				report.repairedRecords++;
				changed = true;
			}

			const paths = idToPaths.get(record.fileId) ?? [];
			paths.push(path);
			idToPaths.set(record.fileId, paths);
		}

		for (const paths of idToPaths.values()) {
			if (paths.length <= 1) {
				continue;
			}
			const preferred = paths.find((path) => (app ? !!app.vault.getFileByPath(path) : false)) ?? paths[0];
			for (const path of paths) {
				if (path === preferred) {
					continue;
				}
				readData[path].fileId = this.generateNoteId();
				report.repairedDuplicates++;
				report.repairedRecords++;
				changed = true;
			}
		}

		this.rebuildIndex();
		if (changed) {
			await this.markDirty(true);
		}
		return report;
	}

	public async flush(): Promise<void> {
		if (!this.dirty) {
			return;
		}
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}

		this.dirty = false;
		try {
			await this.plugin.saveData(this.data);
		} catch (error) {
			this.dirty = true;
			console.error("[focus-time] Failed to save plugin data", error);
		}
	}

	private async markDirty(immediate: boolean): Promise<void> {
		this.dirty = true;
		if (immediate) {
			await this.flush();
			return;
		}
		if (this.saveTimer !== null) {
			return;
		}
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.flush();
		}, SAVE_DELAY_MS);
	}

	private rebuildIndex(): void {
		this.pathByFileId.clear();
		const readData = this.data.readData as Record<string, ReadRecordLike> | undefined;
		if (!readData || typeof readData !== "object") {
			return;
		}
		for (const path of Object.keys(readData)) {
			const record = readData[path];
			if (record && record.fileId && !this.pathByFileId.has(record.fileId)) {
				this.pathByFileId.set(record.fileId, path);
			}
		}
	}

	private generateNoteId(): string {
		const random = Math.random().toString(36).slice(2, 6);
		return `${Date.now()}-${random}`;
	}
}
