import { beforeAll, describe, expect, it } from "vitest";
import { Exporter } from "../src/core/export/exporter";
import { FileStore } from "../src/core/storage/fileStore";
import { FocusIndex } from "../src/core/storage/focusIndex";
import { FocusEvent } from "../src/core/storage/types";
import I18n from "../src/language/i18n";
import { FakeAdapter, createFakeApp } from "./helpers/fakeAdapter";

const start = new Date(2026, 0, 5, 9, 30, 0).getTime();

const events: FocusEvent[] = [
	{
		v: 1,
		id: "s1",
		dev: "dev1",
		at: start,
		type: "session",
		ses: "ses1",
		note: "n1",
		path: "Work/a,b.md",
		start,
		end: start + 30 * 60_000,
		ms: 30 * 60_000,
		kind: "edit",
		idle: "guard",
		tz: "Asia/Shanghai"
	}
];

function createExporter() {
	const adapter = new FakeAdapter();
	const files = new FileStore(createFakeApp(adapter) as never);
	const index = new FocusIndex();
	index.rebuild(events);
	const storage = {
		events: {readAll: async () => events},
		index,
		registry: {entries: () => [{id: "n1", path: "Work/a,b.md"}]},
		getPath: (id: string) => (id === "n1" ? "Work/a,b.md" : undefined)
	};
	return {adapter, exporter: new Exporter(storage as never, files)};
}

beforeAll(() => {
	I18n.getInstance().setLanguage("en");
});

describe("Exporter", () => {
	it("exports CSV with escaped note paths", async () => {
		const {adapter, exporter} = createExporter();
		const path = await exporter.exportCsv();
		const content = adapter.files.get(path) ?? "";

		expect(path.startsWith("_focus_time/exports/")).toBe(true);
		expect(content.split("\n")[0]).toBe("date,start,end,duration_min,note,kind,device,id");
		expect(content).toContain('"Work/a,b.md"');
		expect(content).toContain("30.0");
	});

	it("exports raw JSON", async () => {
		const {adapter, exporter} = createExporter();
		const path = await exporter.exportJson();
		const parsed = JSON.parse(adapter.files.get(path) ?? "{}");

		expect(parsed.schemaVersion).toBe(1);
		expect(parsed.events).toHaveLength(1);
		expect(parsed.notes[0].path).toBe("Work/a,b.md");
	});

	it("exports a Markdown report", async () => {
		const {adapter, exporter} = createExporter();
		I18n.getInstance().setLanguage("zh");
		const path = await exporter.exportMarkdown("week", new Date(2026, 0, 5));
		const content = adapter.files.get(path) ?? "";

		expect(content).toContain("# 专注时间报告");
		expect(content).toContain("Work/a,b.md");
		I18n.getInstance().setLanguage("en");
	});
});
