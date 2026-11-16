import { describe, expect, it } from "vitest";
import { FocusIndex } from "../src/core/storage/focusIndex";
import { FocusEvent } from "../src/core/storage/types";
import { getGoalStreak, getPeakHour, getRangeStats, getStreak, mergeSessions, sessionHistogram, categoryForPath, ROOT_CATEGORY, OTHER_CATEGORY } from "../src/analytics/metrics";
import { previousRange } from "../src/analytics/period";

function session(id: string, ses: string, note: string, start: number, ms: number, kind: "edit" | "read" = "read"): FocusEvent {
	return {
		v: 1,
		id,
		dev: "dev1",
		at: start,
		type: "session",
		ses,
		note,
		path: note === "n1" ? "Work/a.md" : "Books/b.md",
		start,
		end: start + ms,
		ms,
		kind,
		idle: "guard",
		tz: "Asia/Shanghai"
	};
}

function buildIndex() {
	const day1 = new Date(2026, 0, 5, 9, 0, 0).getTime();
	const day2 = new Date(2026, 0, 6, 20, 0, 0).getTime();
	const index = new FocusIndex();
	index.rebuild([
		session("s1", "x", "n1", day1, 30 * 60_000, "edit"),
		session("s2", "x", "n1", day1 + 10 * 60_000, 10 * 60_000, "edit"),
		session("s3", "y", "n1", day1 + 5 * 60 * 60_000, 5 * 60_000),
		session("s4", "z", "n2", day2, 20 * 60_000),
		{
			v: 1,
			id: "l1",
			dev: "dev1",
			at: day2,
			type: "legacyDay",
			key: "k1",
			note: "n1",
			date: "2026-01-06",
			ms: 10 * 60_000,
			src: "v0"
		}
	]);
	return {index, day1, day2};
}

describe("analytics metrics", () => {
	it("aggregates a date range across sessions and legacy days", () => {
		const {index} = buildIndex();
		const stats = getRangeStats(index, {from: "2026-01-05", to: "2026-01-06"}, (noteId) => (noteId === "n1" ? "Work/a.md" : "Books/b.md"));

		expect(stats.totalMs).toBe(75 * 60_000);
		expect(stats.sessionCount).toBe(3);
		expect(stats.noteCount).toBe(2);
		expect(stats.noteTotals.get("n1")).toBe(55 * 60_000);
		expect(stats.noteTotals.get("n2")).toBe(20 * 60_000);
		expect(stats.folderTotals.get("Work")).toBe(55 * 60_000);
		expect(stats.folderTotals.get("Books")).toBe(20 * 60_000);
		expect(stats.folderNoteCounts.get("Work")).toBe(1);
		expect(stats.folderNoteCounts.get("Books")).toBe(1);
		expect(stats.legacyDays).toBe(1);
		expect(stats.deepWorkMs).toBe(40 * 60_000);
		expect(stats.switchCount).toBe(0);
		expect(stats.hourMatrix[1][9]).toBe(40 * 60_000);
	});

	it("merges session segments that share a session id", () => {
		const {index} = buildIndex();
		const merged = mergeSessions(index.getSessions());

		expect(merged).toHaveLength(3);
		expect(merged[0].ms).toBe(40 * 60_000);
		expect(merged[0].kind).toBe("edit");
	});

	it("computes streaks", () => {
		const {index} = buildIndex();
		expect(getStreak(index, "2026-01-06")).toBe(2);
		expect(getStreak(index, "2026-01-07")).toBe(0);
		expect(getGoalStreak(index, 30 * 60_000, "2026-01-06")).toBe(2);
		expect(getGoalStreak(index, 60 * 60_000, "2026-01-06")).toBe(0);
	});

	it("finds the peak hour", () => {
		const {index} = buildIndex();
		const stats = getRangeStats(index, {from: "2026-01-05", to: "2026-01-06"}, () => undefined);
		const peak = getPeakHour(stats.hourMatrix);

		expect(peak).not.toBeNull();
		expect(peak?.weekday).toBe(1);
		expect(peak?.hour).toBe(9);
	});

	it("buckets session lengths", () => {
		const {index} = buildIndex();
		const merged = mergeSessions(index.getSessions());
		expect(sessionHistogram(merged)).toEqual([0, 1, 1, 1, 0]);
	});

	it("calculates the previous range", () => {
		expect(previousRange({from: "2026-01-05", to: "2026-01-06"})).toEqual({from: "2026-01-03", to: "2026-01-04"});
	});

	it("maps paths to clean top-level categories", () => {
		expect(categoryForPath("工作/量化交易/复盘.md")).toBe("工作");
		expect(categoryForPath("  工作/a.md")).toBe("工作");
		expect(categoryForPath("/学习/b.md")).toBe("学习");
		expect(categoryForPath("root.md")).toBe(ROOT_CATEGORY);
		expect(categoryForPath("file:///tmp/page.html")).toBe(OTHER_CATEGORY);
		expect(categoryForPath("https://example.com")).toBe(OTHER_CATEGORY);
	});
});
