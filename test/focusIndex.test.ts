import { describe, expect, it } from "vitest";
import { FocusIndex } from "../src/core/storage/focusIndex";
import { FocusEvent } from "../src/core/storage/types";

function session(id: string, start: number, ms: number, note = "n1", ses = "s1"): FocusEvent {
	return {
		v: 1,
		id,
		dev: "dev1",
		at: start,
		type: "session",
		ses,
		note,
		path: `${note}.md`,
		start,
		end: start + ms,
		ms,
		kind: "read",
		idle: "guard",
		tz: "Asia/Shanghai"
	};
}

describe("FocusIndex", () => {
	it("aggregates sessions, legacy days and adjustments", () => {
		const start = new Date(2026, 0, 5, 10, 0, 0).getTime();
		const index = new FocusIndex();

		index.rebuild([
			session("e1", start, 60_000),
			session("e2", start + 5 * 60_000, 30_000),
			{
				v: 1,
				id: "l1",
				dev: "dev1",
				at: start,
				type: "legacyDay",
				key: "k1",
				note: "n2",
				date: "2026-01-05",
				ms: 120_000,
				src: "v0"
			},
			{
				v: 1,
				id: "l2",
				dev: "dev1",
				at: start,
				type: "legacyTotal",
				note: "n3",
				ms: 5_000,
				src: "v0-readData"
			},
			{
				v: 1,
				id: "a1",
				dev: "dev1",
				at: start,
				type: "adjust",
				note: "n1",
				ms: -10_000,
				reason: "manual"
			}
		]);

		expect(index.getDayTotal("2026-01-05")).toBe(210_000);
		expect(index.getNoteTotal("n1")).toBe(80_000);
		expect(index.getNoteTotal("n2")).toBe(120_000);
		expect(index.getNoteTotal("n3")).toBe(5_000);
		expect(index.getNoteAggregate("n1").sessions).toBe(1);
		expect(index.isLegacyDate("2026-01-05")).toBe(true);

		const stats = index.getStats();
		expect(stats.sessions).toBe(2);
		expect(stats.legacyDays).toBe(1);
		expect(stats.legacyDayMs).toBe(120_000);
	});

	it("ignores duplicate event ids", () => {
		const start = new Date(2026, 0, 5, 10, 0, 0).getTime();
		const index = new FocusIndex();
		const event = session("e1", start, 60_000);

		index.rebuild([event, event]);

		expect(index.getNoteTotal("n1")).toBe(60_000);
		expect(index.getStats().events).toBe(1);
	});

	it("never returns a negative total", () => {
		const start = new Date(2026, 0, 5, 10, 0, 0).getTime();
		const index = new FocusIndex();
		index.rebuild([
			session("e1", start, 1_000),
			{
				v: 1,
				id: "a1",
				dev: "dev1",
				at: start,
				type: "adjust",
				note: "n1",
				ms: -5_000,
				reason: "manual"
			}
		]);

		expect(index.getNoteTotal("n1")).toBe(0);
	});

	it("treats legacy totals as a max baseline, not an additive series", () => {
		const start = new Date(2026, 0, 5, 10, 0, 0).getTime();
		const index = new FocusIndex();
		const base = {v: 1 as const, dev: "dev1", at: start, type: "legacyTotal" as const, note: "n1", src: "v0-readData" as const};

		index.rebuild([
			{...base, id: "l1", ms: 5_000},
			{...base, id: "l2", ms: 3_000}
		]);
		expect(index.getNoteTotal("n1")).toBe(5_000);

		index.add({...base, id: "l3", ms: 8_000});
		expect(index.getNoteTotal("n1")).toBe(8_000);
	});
});
