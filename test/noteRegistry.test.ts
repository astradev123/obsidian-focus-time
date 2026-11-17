import { describe, expect, it } from "vitest";
import { FileStore } from "../src/core/storage/fileStore";
import { NoteRegistry } from "../src/core/storage/noteRegistry";
import { configureDataRoot } from "../src/core/storage/paths";
import { FakeAdapter, createFakeApp } from "./helpers/fakeAdapter";

const PLUGIN_DIR = ".obsidian/plugins/focus-time";

function createRegistry() {
	configureDataRoot(PLUGIN_DIR);
	const adapter = new FakeAdapter();
	const files = new FileStore(createFakeApp(adapter) as never);
	return {adapter, registry: new NoteRegistry(files)};
}

describe("NoteRegistry", () => {
	it("creates ids per path and persists them", async () => {
		const {adapter, registry} = createRegistry();
		await registry.load();

		const id = registry.ensure("a.md");
		await registry.flush();

		expect(registry.getId("a.md")).toBe(id);
		expect(registry.getPath(id)).toBe("a.md");
		expect(adapter.files.has(`${PLUGIN_DIR}/_focus_time/notes.json`)).toBe(true);
	});

	it("keeps the new path when legacy data re-imports an old path", async () => {
		const {registry} = createRegistry();
		await registry.load();

		await registry.importEntries([{id: "n1", path: "old.md"}]);
		registry.rename("n1", "new.md");
		await registry.flush();

		await registry.importEntries([{id: "n1", path: "old.md"}], {preserveExisting: true});

		expect(registry.getPath("n1")).toBe("new.md");
		expect(registry.getId("old.md")).toBeUndefined();
		expect(registry.getId("new.md")).toBe("n1");
	});
});
