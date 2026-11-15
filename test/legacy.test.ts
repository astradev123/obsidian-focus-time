import { describe, expect, it } from "vitest";
import { FocusIndex } from "../src/core/storage/focusIndex";
import { LegacyScan, buildLegacyEvents, verifyLegacy } from "../src/core/storage/legacy";

const scan: LegacyScan = {
	notes: [
		{id: "a", path: "a.md", totalMs: 100_000, residualMs: 20_000}
	],
	days: [
		{date: "2026-01-05", noteId: "a", ms: 80_000}
	],
	unmappedMs: 500,
	dailyFiles: 1
};

describe("legacy migration helpers", () => {
	it("builds deterministic, idempotent events", () => {
		const first = buildLegacyEvents(scan, "dev1");
		const second = buildLegacyEvents(scan, "dev1");

		expect(first.map((event) => event.id)).toEqual(second.map((event) => event.id));
		expect(first).toHaveLength(2);
		expect(first.some((event) => event.type === "legacyDay")).toBe(true);
		expect(first.some((event) => event.type === "legacyTotal")).toBe(true);
	});

	it("reproduces v0 totals exactly", () => {
		const index = new FocusIndex();
		index.rebuild(buildLegacyEvents(scan, "dev1"));

		const verification = verifyLegacy(
			scan,
			(noteId) => index.getNoteTotal(noteId),
			(date) => index.getDayTotal(date)
		);

		expect(verification.ok).toBe(true);
		expect(index.getNoteTotal("a")).toBe(100_000);
		expect(index.getDayTotal("2026-01-05")).toBe(80_000);
	});

	it("detects a missing record", () => {
		const index = new FocusIndex();
		index.rebuild(buildLegacyEvents(scan, "dev1").filter((event) => event.type !== "legacyTotal"));

		const verification = verifyLegacy(
			scan,
			(noteId) => index.getNoteTotal(noteId),
			(date) => index.getDayTotal(date)
		);

		expect(verification.ok).toBe(false);
		expect(verification.noteMismatches[0].expected).toBe(100_000);
	});
});
