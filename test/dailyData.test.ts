import { describe, expect, it } from "vitest";
import type { Plugin } from "obsidian";
import { DailyReadDataManager } from "../src/core/dailyReadDataManager";

class FakeAdapter {
	files = new Map<string, string>();
	dirs = new Set<string>();

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.dirs.has(path);
	}

	async read(path: string): Promise<string> {
		const value = this.files.get(path);
		if (value === undefined) {
			throw new Error(`ENOENT: ${path}`);
		}
		return value;
	}

	async write(path: string, data: string): Promise<void> {
		this.files.set(path, data);
	}

	async process(path: string, update: (data: string) => string): Promise<string> {
		const next = update(this.files.get(path) ?? "");
		this.files.set(path, next);
		return next;
	}

	async mkdir(path: string): Promise<void> {
		this.dirs.add(path);
	}

	async list(path: string): Promise<{ files: string[]; folders: string[] }> {
		const prefix = path.endsWith("/") ? path : `${path}/`;
		const files = Array.from(this.files.keys()).filter(
			(file) => file.startsWith(prefix) && !file.slice(prefix.length).includes("/")
		);
		return { files, folders: [] };
	}
}

function createManager() {
	const adapter = new FakeAdapter();
	const plugin = {
		app: {vault: {adapter, configDir: ".obsidian"}},
		manifest: {id: "focus-time", dir: ".obsidian/plugins/focus-time"}
	} as unknown as Plugin;
	return {manager: new DailyReadDataManager(plugin), adapter};
}

const DATA_DIR = ".obsidian/plugins/focus-time/data";

describe("DailyReadDataManager", () => {
	it("writes zero-padded files and accumulates durations", async () => {
		const {manager, adapter} = createManager();

		await manager.addDuration("2026-1-5", "note-1", 60_000);
		await manager.addDuration("2026-1-5", "note-1", 30_000);

		const raw = adapter.files.get(`${DATA_DIR}/2026-01-05.json`);
		expect(raw).toBeTruthy();
		const parsed = JSON.parse(raw as string);
		expect(parsed.dailyReadData["note-1"].duration).toBe(90_000);
	});

	it("merges legacy unpadded files with padded files", async () => {
		const {manager, adapter} = createManager();
		adapter.files.set(
			`${DATA_DIR}/2025-1-13.json`,
			JSON.stringify({dailyReadData: {a: {fileId: "a", duration: 60_000, openCount: 1}}})
		);

		await manager.addDuration("2025-01-13", "b", 30_000);

		const merged = await manager.loadDailyData("2025-01-13");
		const daily = merged.dailyReadData as Record<string, { duration: number }>;
		expect(daily.a.duration).toBe(60_000);
		expect(daily.b.duration).toBe(30_000);
	});

	it("does not double count identical records across both file names", async () => {
		const {manager, adapter} = createManager();
		const record = {dailyReadData: {a: {fileId: "a", duration: 60_000, openCount: 1}}};
		adapter.files.set(`${DATA_DIR}/2025-1-13.json`, JSON.stringify(record));
		adapter.files.set(`${DATA_DIR}/2025-01-13.json`, JSON.stringify(record));

		const merged = await manager.loadDailyData("2025-01-13");
		const daily = merged.dailyReadData as Record<string, { duration: number }>;
		expect(daily.a.duration).toBe(60_000);
	});

	it("lists unique normalized dates", async () => {
		const {manager, adapter} = createManager();
		adapter.files.set(`${DATA_DIR}/2025-1-13.json`, "{}");
		adapter.files.set(`${DATA_DIR}/2025-01-13.json`, "{}");
		adapter.files.set(`${DATA_DIR}/2025-02-01.json`, "{}");

		expect(await manager.listDates()).toEqual(["2025-01-13", "2025-02-01"]);
	});

	it("recovers from malformed JSON instead of throwing", async () => {
		const {manager, adapter} = createManager();
		adapter.files.set(`${DATA_DIR}/2025-03-01.json`, "{not json");

		await manager.addDuration("2025-03-01", "a", 1000);

		const merged = await manager.loadDailyData("2025-03-01");
		const daily = merged.dailyReadData as Record<string, { duration: number }>;
		expect(daily.a.duration).toBe(1000);
	});
});
