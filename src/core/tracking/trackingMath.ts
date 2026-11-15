import { DateUtils } from "../../util/dateUtils";

export type IdleMode = "off" | "fixed" | "custom";

export const FIXED_IDLE_MINUTES = 5;
export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 120;
export const MAX_TICK_MULTIPLIER = 2.5;

export interface AccrualResult {
	/** Start of the accounted window (wall clock, epoch ms). */
	from: number;
	/** End of the accounted window, already clamped by the idle cutoff. */
	to: number;
	/** Milliseconds that should be added to the current note. */
	countedMs: number;
	/** True when the idle threshold has been exceeded. */
	idleReached: boolean;
	/** True when the wall clock moved backwards and state should be reset. */
	clockWentBackwards: boolean;
}

export interface DaySegment {
	from: number;
	to: number;
	date: string;
	ms: number;
}

export function resolveIdleMs(mode: IdleMode, minutes: number): number {
	if (mode === "off") {
		return 0;
	}
	if (mode === "fixed") {
		return FIXED_IDLE_MINUTES * 60 * 1000;
	}
	const value = Number.isFinite(minutes) ? minutes : FIXED_IDLE_MINUTES;
	const clamped = Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, Math.round(value)));
	return clamped * 60 * 1000;
}

/**
 * Compute how much time to count between the last settlement and `now`.
 *
 * The idle cutoff (last input + threshold) is the stopping point, not the
 * moment we notice the user is idle. That prevents a long AFK gap from being
 * counted just because the check ran late.
 */
export function computeAccrual(
	now: number,
	accruedUntil: number,
	lastInputAt: number,
	idleMs: number,
	maxDelta: number
): AccrualResult {
	if (now < accruedUntil) {
		return {
			from: now,
			to: now,
			countedMs: 0,
			idleReached: false,
			clockWentBackwards: true
		};
	}

	const cutoff = idleMs > 0 ? Math.min(now, lastInputAt + idleMs) : now;
	const raw = cutoff - accruedUntil;
	const countedMs = raw > 0 ? Math.min(raw, Math.max(0, maxDelta)) : 0;

	return {
		from: accruedUntil,
		to: Math.max(accruedUntil, cutoff),
		countedMs,
		idleReached: idleMs > 0 && now - lastInputAt > idleMs,
		clockWentBackwards: false
	};
}

/**
 * Split a time range at local midnights so daily totals stay exact even when a
 * settlement happens after midnight.
 */
export function splitAcrossMidnight(from: number, to: number): DaySegment[] {
	if (to <= from) {
		return [];
	}

	const segments: DaySegment[] = [];
	let cursor = from;
	let guard = 0;

	while (cursor < to && guard < 8) {
		const boundary = DateUtils.nextMidnightMs(cursor);
		const end = Math.min(boundary, to);
		segments.push({
			from: cursor,
			to: end,
			date: DateUtils.toLocalDateFromMs(cursor),
			ms: end - cursor
		});
		cursor = end;
		guard++;
	}

	return segments;
}
