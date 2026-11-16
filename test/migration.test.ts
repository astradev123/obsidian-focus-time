import { describe, expect, it } from "vitest";
import type { Plugin } from "obsidian";
import { DailyReadDataManager } from "../src/core/dailyReadDataManager";
import { PluginDataManager } from "../src/core/pluginDataManager";
import { StorageService } from "../src/core/storage/storageService";
import { FakeAdapter, createFakeApp } from "./helpers/fakeAdapter";

const PLUGIN_DIR = ".obsidian/plugins/focus-time";
const DATA_DIR = `${PLUGIN_DIR}/data`;

function setup() {
	const adapter = new FakeAdapter();
	const app = createFakeApp(adapter);
	adapter.dirs.add(DATA_DIR);

	const readData = {
		"a.md": {fileId: "a", filePath: "a.md", duration: 90_000, openCount: 1},
		"b.md": {fileId: "b", filePath: "b.md", duration: 25_000, openCount: 1}
	};

	adapter.files.set(`${PLUGIN_DIR}/data.json`, JSON.stringify({readData}));
	adapter.files.set(
		`${DATA_DIR}/2026-1-5.json`,
		JSON.stringify({
			dailyReadData: {
				a: {fileId: "a", duration: 60_000, openCount: 1},
				b: {fileId: "b", duration: 30_000, openCount: 1}
			}
		})
	);
	adapter.files.set(
		`${DATA_DIR}/2026-01-06.json`,
		JSON.stringify({dailyReadData: {a: {fileId: "a", duration: 30_000, openCount: 1}}})
	);

	const plugin = {app, manifest: {id: "focus-time", dir: PLUGIN_DIR}} as unknown as Plugin;
	const dailyManager = new DailyReadDataManager(plugin);
	const dataManager = {
		getCategory: (category: string) => (category === "readData" ? readData : undefined),
		normalizeLegacyData: async () => ({convertedIds: 0, repairedDuplicates: 0, repairedRecords: 0})
	} as unknown as PluginDataManager;

	const storage = new StorageService(app as never, PLUGIN_DIR, "dev1", dataManager, dailyManager);
	return {adapter, storage, app, dataManager, dailyManager};
}

describe("StorageService migration", () => {
	it("backs up v0, imports events and reproduces totals", async () => {
		const {adapter, storage} = setup();

		await storage.init();

		expect(adapter.files.has("_focus_time/meta.json")).toBe(true);
		expect(Array.from(adapter.files.keys()).some((key) => key.startsWith("_focus_time/archive/v0-"))).toBe(true);
		expect(Array.from(adapter.files.keys()).some((key) => key.startsWith("_focus_time/reports/migration-"))).toBe(true);

		expect(storage.getTotalForPath("a.md")).toBe(90_000);
		expect(storage.getTotalForPath("b.md")).toBe(30_000);
		expect(storage.getStats().events).toBe(3);
		expect(storage.getStats().legacyDays).toBe(2);
		expect(storage.getStats().migratedAt).toBeGreaterThan(0);
	});

	it("absorbs day files written by an older client", async () => {
		const {adapter, storage} = setup();
		await storage.init();

		adapter.files.set(
			`${DATA_DIR}/2026-01-07.json`,
			JSON.stringify({dailyReadData: {b: {fileId: "b", duration: 10_000, openCount: 1}}})
		);

		const imported = await storage.importNewLegacy();

		expect(imported).toBe(1);
		expect(storage.getTotalForPath("b.md")).toBe(40_000);
		expect(storage.getStats().events).toBe(4);
	});

	it("keeps ids and totals when a folder with nested notes is moved", async () => {
		const {storage} = setup();
		await storage.init();

		const x = await storage.ensureNote("A/x.md");
		const y = await storage.ensureNote("A/sub/y.md");
		const z = await storage.ensureNote("C/z.md");
		const keep = await storage.ensureNote("A2/keep.md");
		const now = Date.now();
		await storage.recordSession({
			ses: "move-session",
			note: x,
			path: "A/x.md",
			start: now,
			end: now + 60_000,
			ms: 60_000,
			kind: "edit",
			idle: "off"
		});
		expect(storage.getTotalForPath("A/x.md")).toBe(60_000);

		await storage.handleFolderRename("A", "B");

		expect(storage.getPath(x)).toBe("B/x.md");
		expect(storage.getPath(y)).toBe("B/sub/y.md");
		expect(storage.getPath(z)).toBe("C/z.md");
		expect(storage.getPath(keep)).toBe("A2/keep.md");
		expect(storage.getTotalForPath("B/x.md")).toBe(60_000);
		expect(storage.getTotalForPath("A/x.md")).toBe(0);

		await storage.handleRename("B/sub/y.md", "D/y.md");
		expect(storage.getPath(y)).toBe("D/y.md");
		expect(storage.getPath(x)).toBe("B/x.md");
	});

	it("recovers a missed registry path from rename events on reload", async () => {
		const {adapter, storage, app, dataManager, dailyManager} = setup();
		await storage.init();

		const noteId = await storage.ensureNote("A/x.md");
		const now = Date.now();
		await storage.recordSession({
			ses: "replay-session",
			note: noteId,
			path: "A/x.md",
			start: now,
			end: now + 60_000,
			ms: 60_000,
			kind: "edit",
			idle: "off"
		});
		await storage.handleFolderRename("A", "B");
		await storage.flush();

		const registry = JSON.parse(adapter.files.get("_focus_time/notes.json") ?? "{}");
		registry.byId[noteId].path = "A/x.md";
		delete registry.byPath["B/x.md"];
		registry.byPath["A/x.md"] = noteId;
		adapter.files.set("_focus_time/notes.json", JSON.stringify(registry));

		const reloaded = new StorageService(app as never, PLUGIN_DIR, "dev1", dataManager, dailyManager);
		await reloaded.init();

		expect(reloaded.getPath(noteId)).toBe("B/x.md");
		expect(reloaded.getTotalForPath("B/x.md")).toBe(60_000);
	});

	it("does not re-import unchanged day files", async () => {
		const {storage} = setup();
		await storage.init();

		const imported = await storage.importNewLegacy();

		expect(imported).toBe(0);
		expect(storage.getStats().events).toBe(3);
	});
});
