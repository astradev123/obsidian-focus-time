import { App, normalizePath, Plugin } from "obsidian";
import { ReadRecord } from "../interface/readRecord";
import { DateUtils } from "../util/dateUtils";

type DayFile = {
	dailyReadData?: Record<string, ReadRecord>;
	[key: string]: unknown;
};

/**
 * Owns the per-day JSON files.
 *
 * Writes go through `DataAdapter.process()` so read-modify-write is atomic;
 * a power loss cannot truncate a day file the way it could truncate the old
 * whole-file rewrite.
 */
export class DailyReadDataManager {
	private readonly app: App;
	private readonly dataDir: string;

	constructor(plugin: Plugin) {
		this.app = plugin.app;
		const pluginDir = plugin.manifest.dir ?? `${this.app.vault.configDir}/plugins/${plugin.manifest.id}`;
		this.dataDir = normalizePath(`${pluginDir}/data`);
	}

	public getDataDir(): string {
		return this.dataDir;
	}

	/**
	 * Add duration to one note for one local date. Creates the file when needed.
	 */
	public async addDuration(date: string, fileId: string, ms: number): Promise<void> {
		if (!Number.isFinite(ms) || ms <= 0) {
			return;
		}

		const normalizedDate = DateUtils.normalizeKey(date);
		const filePath = this.getFilePath(normalizedDate);
		await this.ensureDir();

		try {
			if (!(await this.app.vault.adapter.exists(filePath))) {
				await this.app.vault.adapter.write(filePath, JSON.stringify({ dailyReadData: {} }, null, 2));
			}
			await this.updateFile(filePath, (content) => {
				const data = this.parseDayFile(content);
				const daily = data.dailyReadData ?? {};
				const existing = daily[fileId];
				const next: ReadRecord = existing ?? {
					filePath: "",
					openCount: 0,
					fileId,
					duration: 0
				};
				next.fileId = next.fileId || fileId;
				next.duration = (Number(next.duration) || 0) + ms;
				daily[fileId] = next;
				data.dailyReadData = daily;
				return JSON.stringify(data, null, 2);
			});
		} catch (error) {
			console.error(`[focus-time] Failed to write daily data for ${normalizedDate}`, error);
		}
	}

	/**
	 * Load one day, merging the padded and legacy unpadded file names.
	 */
	public async loadDailyData(date: string): Promise<Record<string, unknown>> {
		const normalizedDate = DateUtils.normalizeKey(date);
		const primary = await this.readJson(this.getFilePath(normalizedDate));
		const legacyPath = this.getLegacyFilePath(normalizedDate);
		const legacy = legacyPath !== this.getFilePath(normalizedDate) ? await this.readJson(legacyPath) : null;
		return this.mergeDayFiles(legacy, primary);
	}

	public async loadTodayData(): Promise<Record<string, unknown>> {
		return this.loadDailyData(DateUtils.toLocalDate());
	}

	/**
	 * All dates that have a data file, normalized to `YYYY-MM-DD`.
	 */
	public async listDates(): Promise<string[]> {
		try {
			const listing = await this.app.vault.adapter.list(this.dataDir);
			const dates = new Set<string>();
			for (const file of listing.files) {
				if (!file.toLowerCase().endsWith(".json")) {
					continue;
				}
				const name = file.split("/").pop() ?? "";
				const parts = DateUtils.parseKey(name);
				if (parts) {
					dates.add(DateUtils.normalizeKey(name));
				}
			}
			return Array.from(dates).sort();
		} catch {
			return [];
		}
	}

	public async exists(date: string): Promise<boolean> {
		const normalizedDate = DateUtils.normalizeKey(date);
		if (await this.app.vault.adapter.exists(this.getFilePath(normalizedDate))) {
			return true;
		}
		const legacyPath = this.getLegacyFilePath(normalizedDate);
		return legacyPath !== this.getFilePath(normalizedDate) && this.app.vault.adapter.exists(legacyPath);
	}

	private getFilePath(date: string): string {
		return `${this.dataDir}/${DateUtils.normalizeKey(date)}.json`;
	}

	/**
	 * Older versions did not zero-pad the month/day (`2025-1-13.json`).
	 */
	private getLegacyFilePath(date: string): string {
		const parts = DateUtils.parseKey(date);
		if (!parts) {
			return this.getFilePath(date);
		}
		return `${this.dataDir}/${parts.year}-${parts.month}-${parts.day}.json`;
	}

	private async ensureDir(): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(this.dataDir))) {
			try {
				await adapter.mkdir(this.dataDir);
			} catch {
				// Another writer may have created it between exists() and mkdir().
			}
		}
	}

	private async readJson(filePath: string): Promise<DayFile | null> {
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(filePath))) {
				return null;
			}
			return this.parseDayFile(await adapter.read(filePath));
		} catch (error) {
			console.error(`[focus-time] Failed to read ${filePath}`, error);
			return null;
		}
	}

	private parseDayFile(content: string): DayFile {
		if (!content || !content.trim()) {
			return { dailyReadData: {} };
		}
		try {
			const parsed = JSON.parse(content) as DayFile;
			return parsed && typeof parsed === "object" ? parsed : { dailyReadData: {} };
		} catch {
			return { dailyReadData: {} };
		}
	}

	private async updateFile(filePath: string, update: (content: string) => string): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (typeof adapter.process === "function") {
			await adapter.process(filePath, update);
			return;
		}
		const content = await adapter.read(filePath);
		await adapter.write(filePath, update(content));
	}

	/**
	 * Merge legacy and padded files for the same date.
	 * Identical durations are treated as the same record; different ones are
	 * summed, because the data may have been split across both file names.
	 */
	private mergeDayFiles(legacy: DayFile | null, primary: DayFile | null): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		for (const source of [legacy, primary]) {
			if (!source) {
				continue;
			}
			for (const key of Object.keys(source)) {
				if (key !== "dailyReadData" && result[key] === undefined) {
					result[key] = source[key];
				}
			}
		}

		const merged: Record<string, ReadRecord> = {};
		for (const source of [legacy, primary]) {
			const daily = source?.dailyReadData;
			if (!daily || typeof daily !== "object") {
				continue;
			}
			for (const key of Object.keys(daily)) {
				const record = daily[key];
				if (!record || typeof record !== "object") {
					continue;
				}
				const duration = Number(record.duration) || 0;
				const existing = merged[key];
				if (existing) {
					if (existing.duration !== duration) {
						existing.duration += duration;
					}
					existing.openCount = Math.max(existing.openCount, Number(record.openCount) || 0);
				} else {
					merged[key] = {
						filePath: record.filePath ?? "",
						openCount: Number(record.openCount) || 0,
						fileId: record.fileId ?? key,
						duration
					};
				}
			}
		}

		result.dailyReadData = merged;
		return result;
	}
}
