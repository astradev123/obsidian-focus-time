import { beforeAll, describe, expect, it } from "vitest";
import type { Plugin } from "obsidian";
import { PluginDataManager } from "../src/core/pluginDataManager";

class FakePlugin {
	saved = 0;

	constructor(public data: Record<string, unknown>) {}

	app = {
		vault: {
			getFileByPath: (path: string) => (path === "a.md" ? {} : null)
		}
	};

	manifest = {id: "focus-time"};

	async loadData() {
		return JSON.parse(JSON.stringify(this.data));
	}

	async saveData(data: Record<string, unknown>) {
		this.data = JSON.parse(JSON.stringify(data));
		this.saved++;
	}
}

beforeAll(() => {
	// PluginDataManager uses window timers for debounced saves.
	(globalThis as unknown as {window: unknown}).window = {
		setTimeout: globalThis.setTimeout,
		clearTimeout: globalThis.clearTimeout
	};
});

function createManager(data: Record<string, unknown>) {
	const plugin = new FakePlugin(data);
	const manager = new PluginDataManager(plugin as unknown as Plugin);
	return {plugin, manager};
}

describe("PluginDataManager", () => {
	it("converts legacy id fields and splits duplicate file ids", async () => {
		const {plugin, manager} = createManager({
			readData: {
				"a.md": {id: "1", duration: 10, openCount: 1},
				"b.md": {fileId: "1", duration: 20, openCount: 2}
			}
		});

		await manager.loadData();
		const report = await manager.normalizeLegacyData(plugin.app as never);

		expect(report.convertedIds).toBe(1);
		expect(report.repairedDuplicates).toBe(1);

		const readData = manager.getCategory("readData") as Record<string, { fileId: string; id?: string }>;
		expect(readData["a.md"].fileId).toBe("1");
		expect(readData["b.md"].fileId).not.toBe("1");
		expect(readData["a.md"].id).toBeUndefined();
		expect(manager.getPathByFileId("1")).toBe("a.md");
		expect(plugin.saved).toBeGreaterThan(0);
	});

	it("creates a note id before the first duration is written", async () => {
		const {manager} = createManager({});
		await manager.loadData();

		const fileId = await manager.ensureNote("notes/new.md");
		expect(fileId.length).toBeGreaterThan(0);

		await manager.addDuration("notes/new.md", fileId, 5000);

		const record = manager.get("readData", "notes/new.md") as { duration: number; fileId: string };
		expect(record.duration).toBe(5000);
		expect(record.fileId).toBe(fileId);
		expect(manager.getPathByFileId(fileId)).toBe("notes/new.md");
	});

	it("merges remote totals without lowering local durations", async () => {
		const {plugin, manager} = createManager({
			readData: {
				"a.md": {fileId: "a", filePath: "a.md", duration: 100, openCount: 1}
			},
			settings: {strictMode: true}
		});
		await manager.loadData();

		plugin.data = {
			readData: {
				"a.md": {fileId: "a", filePath: "a.md", duration: 250, openCount: 4},
				"b.md": {fileId: "b", filePath: "b.md", duration: 50, openCount: 1}
			}
		};

		await manager.mergeFromDisk();

		const a = manager.get("readData", "a.md") as { duration: number; openCount: number };
		const b = manager.get("readData", "b.md") as { duration: number };
		expect(a.duration).toBe(250);
		expect(a.openCount).toBe(4);
		expect(b.duration).toBe(50);
	});
});
