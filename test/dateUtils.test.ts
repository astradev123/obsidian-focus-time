import { describe, expect, it } from "vitest";
import { DateUtils } from "../src/util/dateUtils";

describe("DateUtils", () => {
	it("zero-pads local dates", () => {
		expect(DateUtils.toLocalDate(new Date(2026, 0, 5))).toBe("2026-01-05");
		expect(DateUtils.toLocalDate(new Date(2026, 10, 15))).toBe("2026-11-15");
	});

	it("normalizes legacy unpadded keys", () => {
		expect(DateUtils.normalizeKey("2025-1-13")).toBe("2025-01-13");
		expect(DateUtils.normalizeKey("2025-1-13.json")).toBe("2025-01-13");
		expect(DateUtils.normalizeKey("2025-01-13")).toBe("2025-01-13");
	});

	it("rejects invalid keys", () => {
		expect(DateUtils.parseKey("not-a-date")).toBeNull();
		expect(DateUtils.parseKey("2026-13-01")).toBeNull();
		expect(DateUtils.parseKey("2026-01-32")).toBeNull();
	});

	it("computes the next local midnight", () => {
		const before = new Date(2026, 10, 15, 23, 59, 30).getTime();
		expect(DateUtils.nextMidnightMs(before)).toBe(new Date(2026, 10, 16, 0, 0, 0).getTime());
	});

	it("uses Sunday as the start of the week", () => {
		const sunday = new Date(2026, 10, 15);
		expect(DateUtils.toLocalDate(DateUtils.startOfWeek(sunday))).toBe("2026-11-15");

		const wednesday = new Date(2026, 10, 18);
		expect(DateUtils.toLocalDate(DateUtils.startOfWeek(wednesday))).toBe("2026-11-15");
	});

	it("adds days without mutating the input", () => {
		const date = new Date(2026, 10, 15);
		const next = DateUtils.addDays(date, 6);
		expect(DateUtils.toLocalDate(next)).toBe("2026-11-21");
		expect(DateUtils.toLocalDate(date)).toBe("2026-11-15");
	});
});
