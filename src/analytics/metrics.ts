import { FocusIndex } from "../core/storage/focusIndex";
import { SessionEvent } from "../core/storage/types";
import { DateUtils } from "../util/dateUtils";
import { DateRange, eachDate } from "./period";

export interface SessionSummary {
	id: string;
	note: string;
	path: string;
	start: number;
	end: number;
	ms: number;
	kind: "edit" | "read";
}

export interface DayKinds {
	edit: number;
	read: number;
	legacy: number;
	total: number;
}

export interface RangeStats {
	range: DateRange;
	totalMs: number;
	activeDays: number;
	noteCount: number;
	sessionCount: number;
	sessions: SessionSummary[];
	avgSessionMs: number;
	medianSessionMs: number;
	longestSessionMs: number;
	deepWorkMs: number;
	deepWorkRatio: number;
	switchCount: number;
	hourMatrix: number[][];
	dayTotals: Array<{date: string; ms: number}>;
	dayKinds: Map<string, DayKinds>;
	noteTotals: Map<string, number>;
	folderTotals: Map<string, number>;
	legacyDays: number;
}

const DEEP_WORK_MS = 25 * 60 * 1000;

export function mergeSessions(events: SessionEvent[]): SessionSummary[] {
	const merged = new Map<string, SessionSummary>();
	for (const event of events) {
		const existing = merged.get(event.ses);
		if (!existing) {
			merged.set(event.ses, {
				id: event.ses,
				note: event.note,
				path: event.path,
				start: event.start,
				end: event.end,
				ms: event.ms,
				kind: event.kind
			});
			continue;
		}
		existing.start = Math.min(existing.start, event.start);
		existing.end = Math.max(existing.end, event.end);
		existing.ms += event.ms;
		if (event.kind === "edit") {
			existing.kind = "edit";
		}
	}
	return Array.from(merged.values()).sort((a, b) => a.start - b.start);
}

export function getRangeStats(
	index: FocusIndex,
	range: DateRange,
	getPath: (noteId: string) => string | undefined
): RangeStats {
	const dayTotals: Array<{date: string; ms: number}> = [];
	const dayKinds = new Map<string, DayKinds>();
	const noteTotals = new Map<string, number>();
	const folderTotals = new Map<string, number>();
	const hourMatrix = Array.from({length: 7}, () => new Array<number>(24).fill(0));
	const noteSet = new Set<string>();
	let totalMs = 0;
	let legacyDays = 0;

	for (const date of eachDate(range)) {
		const day = index.getDay(date);
		if (day.totalMs <= 0) {
			continue;
		}
		dayTotals.push({date, ms: day.totalMs});
		totalMs += day.totalMs;
		if (index.isLegacyDate(date)) {
			legacyDays++;
		}
		dayKinds.set(date, {edit: 0, read: 0, legacy: 0, total: day.totalMs});

		for (const [noteId, ms] of day.notes) {
			noteSet.add(noteId);
			noteTotals.set(noteId, (noteTotals.get(noteId) ?? 0) + ms);
		}
	}

	const inRange = index.getSessions().filter((event) => {
		const date = DateUtils.toLocalDateFromMs(event.start);
		return date >= range.from && date <= range.to;
	});

	for (const event of inRange) {
		const date = DateUtils.toLocalDateFromMs(event.start);
		const kinds = dayKinds.get(date);
		if (kinds) {
			kinds[event.kind] += event.ms;
		}
		const weekday = new Date(event.start).getDay();
		const hour = new Date(event.start).getHours();
		hourMatrix[weekday][hour] += event.ms;
	}

	for (const [date, kinds] of dayKinds) {
		kinds.legacy = Math.max(0, kinds.total - kinds.edit - kinds.read);
	}

	const sessions = mergeSessions(inRange);
	const durations = sessions.map((session) => session.ms).sort((a, b) => a - b);
	const sessionTotal = durations.reduce((sum, ms) => sum + ms, 0);
	const avgSessionMs = durations.length > 0 ? sessionTotal / durations.length : 0;
	const medianSessionMs = durations.length > 0 ? durations[Math.floor(durations.length / 2)] : 0;
	const longestSessionMs = durations.length > 0 ? durations[durations.length - 1] : 0;
	const deepWorkMs = sessions.filter((session) => session.ms >= DEEP_WORK_MS).reduce((sum, session) => sum + session.ms, 0);

	let switchCount = 0;
	for (let i = 1; i < sessions.length; i++) {
		const previous = sessions[i - 1];
		const current = sessions[i];
		if (previous.note !== current.note && current.start - previous.end <= 30 * 60 * 1000) {
			switchCount++;
		}
	}

	for (const [noteId, ms] of noteTotals) {
		const path = getPath(noteId) ?? "";
		const folder = path.includes("/") ? path.split("/")[0] : "";
		const key = folder || "";
		folderTotals.set(key, (folderTotals.get(key) ?? 0) + ms);
	}

	return {
		range,
		totalMs,
		activeDays: dayTotals.length,
		noteCount: noteSet.size,
		sessionCount: sessions.length,
		sessions,
		avgSessionMs,
		medianSessionMs,
		longestSessionMs,
		deepWorkMs,
		deepWorkRatio: totalMs > 0 ? deepWorkMs / totalMs : 0,
		switchCount,
		hourMatrix,
		dayTotals,
		dayKinds,
		noteTotals,
		folderTotals,
		legacyDays
	};
}

export function getStreak(index: FocusIndex, anchorDate: string): number {
	return getGoalStreak(index, 0, anchorDate);
}

/**
 * Consecutive days whose total meets the daily goal.
 * A zero goal falls back to any tracked day.
 */
export function getGoalStreak(index: FocusIndex, goalMs: number, anchorDate: string): number {
	let cursor = anchorDate;
	let streak = 0;

	while (streak < 3650) {
		const total = index.getDayTotal(cursor);
		const meetsGoal = goalMs > 0 ? total >= goalMs : total > 0;
		if (!meetsGoal) {
			break;
		}
		streak++;
		const parts = DateUtils.parseKey(cursor);
		if (!parts) {
			break;
		}
		cursor = DateUtils.toLocalDate(DateUtils.addDays(DateUtils.toDate(parts), -1));
	}
	return streak;
}

export function getPeakHour(matrix: number[][]): {weekday: number; hour: number; ms: number} | null {
	let best: {weekday: number; hour: number; ms: number} | null = null;
	for (let day = 0; day < matrix.length; day++) {
		for (let hour = 0; hour < matrix[day].length; hour++) {
			const ms = matrix[day][hour];
			if (ms > 0 && (!best || ms > best.ms)) {
				best = {weekday: day, hour, ms};
			}
		}
	}
	return best;
}

export function sessionHistogram(sessions: SessionSummary[]): number[] {
	const buckets = [0, 0, 0, 0, 0];
	for (const session of sessions) {
		const minutes = session.ms / 60_000;
		if (minutes < 5) {
			buckets[0]++;
		} else if (minutes < 15) {
			buckets[1]++;
		} else if (minutes < 30) {
			buckets[2]++;
		} else if (minutes < 60) {
			buckets[3]++;
		} else {
			buckets[4]++;
		}
	}
	return buckets;
}
