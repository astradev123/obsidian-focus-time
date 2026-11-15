import { describe, expect, it } from "vitest";
import { FileStore } from "../src/core/storage/fileStore";
import { EventStore } from "../src/core/storage/eventStore";
import { FakeAdapter, createFakeApp } from "./helpers/fakeAdapter";

function createStore() {
	const adapter = new FakeAdapter();
	const app = createFakeApp(adapter);
	const files = new FileStore(app as never);
	const store = new EventStore(files, "dev1", ".obsidian/plugins/focus-time/wal.dev1.jsonl");
	return {adapter, store};
}

function sessionEvent(id: string, start: number, ms = 1000) {
	return {
		v: 1 as const,
		id,
		dev: "dev1",
		at: start,
		type: "session" as const,
		ses: `ses-${id}`,
		note: "n1",
		path: "a.md",
		start,
		end: start + ms,
		ms,
		kind: "read" as const,
		idle: "guard" as const,
		tz: "Asia/Shanghai"
	};
}

describe("EventStore", () => {
	it("records to the WAL and publishes to a monthly shard", async () => {
		const {adapter, store} = createStore();
		const start = new Date(2026, 0, 5, 10, 0, 0).getTime();

		await store.record(sessionEvent("e1", start));
		expect(adapter.files.get(".obsidian/plugins/focus-time/wal.dev1.jsonl")).toContain("e1");

		const published = await store.publish();
		expect(published).toBe(1);
		expect(adapter.files.has("_focus_time/events/2026-01.dev1.jsonl")).toBe(true);
		expect(adapter.files.get(".obsidian/plugins/focus-time/wal.dev1.jsonl")).toBe("");

		const events = await store.readAll();
		expect(events.map((event) => event.id)).toEqual(["e1"]);
	});

	it("deduplicates replayed WAL entries by event id", async () => {
		const {adapter, store} = createStore();
		const start = new Date(2026, 0, 5, 10, 0, 0).getTime();
		const event = sessionEvent("e1", start);

		await store.record(event);
		await store.publish();
		await store.record(event);
		await store.publish();

		const events = await store.readAll();
		expect(events).toHaveLength(1);
		expect(adapter.files.get("_focus_time/events/2026-01.dev1.jsonl")?.split("\n").filter(Boolean)).toHaveLength(2);
	});

	it("imports conflict copies and moves them to the archive", async () => {
		const {adapter, store} = createStore();
		const start = new Date(2026, 0, 5, 10, 0, 0).getTime();
		const conflictPath = "_focus_time/events/2026-01.dev1.sync-conflict-20260105.jsonl";
		adapter.files.set(conflictPath, JSON.stringify(sessionEvent("conflict-1", start)) + "\n");

		const imported = await store.archiveConflicts();
		expect(imported).toBe(1);
		expect(adapter.files.has(conflictPath)).toBe(false);
		expect(Array.from(adapter.files.keys()).some((key) => key.startsWith("_focus_time/archive/conflicts/"))).toBe(true);
		expect((await store.readAll()).map((event) => event.id)).toContain("conflict-1");
	});

	it("survives a torn last line", async () => {
		const {adapter, store} = createStore();
		const start = new Date(2026, 0, 5, 10, 0, 0).getTime();
		const shard = "_focus_time/events/2026-01.dev1.jsonl";
		adapter.files.set(shard, JSON.stringify(sessionEvent("e1", start)) + "\n{\"broken\":");

		const events = await store.readAll();
		expect(events.map((event) => event.id)).toEqual(["e1"]);
	});
});
