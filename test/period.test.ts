import { describe, expect, it } from "vitest";
import { eachDate, getRange, shiftPeriod } from "../src/analytics/period";

describe("period ranges", () => {
	it("starts total at the first recorded day", () => {
		const anchor = new Date(2026, 10, 16);
		expect(getRange("total", anchor, "2025-09-01")).toEqual({
			from: "2025-09-01",
			to: "2026-11-16"
		});
	});

	it("falls back to today when there is no history", () => {
		const anchor = new Date(2026, 10, 16);
		expect(getRange("total", anchor)).toEqual({from: "2026-11-16", to: "2026-11-16"});
		expect(getRange("total", anchor, "2027-01-01")).toEqual({from: "2026-11-16", to: "2026-11-16"});
	});

	it("does not truncate long ranges", () => {
		const dates = eachDate({from: "2025-01-01", to: "2026-12-31"});
		expect(dates).toHaveLength(730);
		expect(dates[0]).toBe("2025-01-01");
		expect(dates[dates.length - 1]).toBe("2026-12-31");
	});

	it("keeps the total anchor stable when navigating", () => {
		const anchor = new Date(2026, 10, 16);
		expect(shiftPeriod("total", anchor, -1).getTime()).toBe(anchor.getTime());
	});
});
