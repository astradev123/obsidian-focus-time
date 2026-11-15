import { describe, expect, it } from "vitest";
import {
	computeAccrual,
	MAX_TICK_MULTIPLIER,
	resolveIdleMs,
	splitAcrossMidnight
} from "../src/core/tracking/trackingMath";

const TICK_MS = 5000;
const MAX_DELTA = TICK_MS * MAX_TICK_MULTIPLIER;

describe("resolveIdleMs", () => {
	it("returns 0 when disabled", () => {
		expect(resolveIdleMs("off", 5)).toBe(0);
	});

	it("uses five minutes for the fixed mode", () => {
		expect(resolveIdleMs("fixed", 30)).toBe(5 * 60 * 1000);
	});

	it("uses the custom value", () => {
		expect(resolveIdleMs("custom", 12)).toBe(12 * 60 * 1000);
	});

	it("clamps custom values", () => {
		expect(resolveIdleMs("custom", 0)).toBe(60 * 1000);
		expect(resolveIdleMs("custom", 9999)).toBe(120 * 60 * 1000);
	});
});

describe("computeAccrual", () => {
	it("counts real elapsed time", () => {
		const now = 1_000_000 + TICK_MS;
		const result = computeAccrual(now, 1_000_000, now, 5 * 60 * 1000, MAX_DELTA);
		expect(result.countedMs).toBe(TICK_MS);
		expect(result.to).toBe(now);
		expect(result.idleReached).toBe(false);
	});

	it("stops at last input + idle threshold, not at detection time", () => {
		const lastInput = 1_000_000;
		const idleMs = 3 * 60 * 1000;
		const now = lastInput + idleMs + 2000;
		const result = computeAccrual(now, lastInput, lastInput, idleMs, idleMs + TICK_MS);
		expect(result.to).toBe(lastInput + idleMs);
		expect(result.countedMs).toBe(idleMs);
		expect(result.idleReached).toBe(true);
	});

	it("does not count when the clock moves backwards", () => {
		const result = computeAccrual(1000, 2000, 1000, 0, MAX_DELTA);
		expect(result.clockWentBackwards).toBe(true);
		expect(result.countedMs).toBe(0);
	});

	it("clamps a long gap to maxDelta", () => {
		const result = computeAccrual(100_000, 0, 100_000, 0, MAX_DELTA);
		expect(result.countedMs).toBe(MAX_DELTA);
		expect(result.to).toBe(100_000);
	});

	it("counts at most the idle threshold during a two-hour AFK gap", () => {
		const start = new Date(2026, 10, 15, 14, 0, 0).getTime();
		const idleMs = 3 * 60 * 1000;
		let accruedUntil = start;
		let total = 0;

		for (let now = start + TICK_MS; now <= start + 2 * 60 * 60 * 1000; now += TICK_MS) {
			const result = computeAccrual(now, accruedUntil, start, idleMs, MAX_DELTA);
			total += result.countedMs;
			accruedUntil = result.to;
		}

		expect(total).toBeGreaterThanOrEqual(idleMs);
		expect(total).toBeLessThanOrEqual(idleMs + TICK_MS);
	});

	it("does not backfill the gap after resuming", () => {
		const lastInput = 1_000_000;
		const idleMs = 3 * 60 * 1000;
		const returnTime = lastInput + 60 * 60 * 1000;

		// The tracker resets accruedUntil to `now` when the user comes back.
		const result = computeAccrual(returnTime + TICK_MS, returnTime, returnTime, idleMs, MAX_DELTA);
		expect(result.countedMs).toBe(TICK_MS);
	});
});

describe("splitAcrossMidnight", () => {
	it("splits a range at local midnight", () => {
		const start = new Date(2026, 10, 15, 23, 59, 30).getTime();
		const segments = splitAcrossMidnight(start, start + 60_000);

		expect(segments).toHaveLength(2);
		expect(segments[0].date).toBe("2026-11-15");
		expect(segments[1].date).toBe("2026-11-16");
		expect(segments[0].ms + segments[1].ms).toBe(60_000);
	});

	it("returns no segments for an empty range", () => {
		expect(splitAcrossMidnight(1000, 1000)).toHaveLength(0);
		expect(splitAcrossMidnight(2000, 1000)).toHaveLength(0);
	});
});
