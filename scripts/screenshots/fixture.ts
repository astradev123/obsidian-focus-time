import { FocusIndex } from "../../src/core/storage/focusIndex";
import { FocusEvent, SessionEvent } from "../../src/core/storage/types";
import { DateUtils } from "../../src/util/dateUtils";
import { FocusTimeSettings } from "../../src/core/settings";

/**
 * Deterministic demo data for the README screenshots.
 *
 * The layout is fixed by a seeded PRNG so repeated runs produce the same
 * numbers. Only the dates move: the set always ends today, which keeps the
 * dashboard looking current instead of showing a frozen month.
 */

interface DemoNote {
	path: string;
	kind: "edit" | "read";
	weight: number;
	evening?: number;
	/** Notes older than this many days do not exist yet, so "new notes" stays meaningful. */
	sinceDaysAgo?: number;
}

const NOTES: DemoNote[] = [
	{path: "Work/Q4 Planning.md", kind: "edit", weight: 9, evening: 3},
	{path: "Work/Weekly Review.md", kind: "edit", weight: 7, evening: 2},
	{path: "Work/Platform Notes.md", kind: "edit", weight: 6, evening: 1},
	{path: "Work/API Design.md", kind: "edit", weight: 5},
	{path: "Work/Hiring Loop.md", kind: "edit", weight: 3},
	{path: "Projects/focus-time/Storage Rewrite.md", kind: "edit", weight: 8, evening: 4},
	{path: "Projects/focus-time/Dashboard Notes.md", kind: "edit", weight: 5, evening: 2},
	{path: "Projects/focus-time/Release Checklist.md", kind: "edit", weight: 3},
	{path: "Reading/Thinking in Systems.md", kind: "read", weight: 8, evening: 6},
	{path: "Reading/DDIA Notes.md", kind: "read", weight: 5, evening: 5},
	{path: "Reading/Notes on Deep Work.md", kind: "read", weight: 4, evening: 4},
	{path: "Reading/The Art of Doing Science.md", kind: "read", weight: 3, evening: 3},
	{path: "Research/Local-first Sync.md", kind: "read", weight: 4, evening: 3},
	{path: "Research/Vector Search.md", kind: "read", weight: 3, evening: 2},
	{path: "Journal/Weekly Log.md", kind: "edit", weight: 4, evening: 2},
	{path: "Reading/Slow Productivity.md", kind: "read", weight: 3, evening: 4, sinceDaysAgo: 21},
	{path: "Research/Agent Memory.md", kind: "read", weight: 3, evening: 3, sinceDaysAgo: 13},
	{path: "Work/Incident Review.md", kind: "edit", weight: 4, evening: 1, sinceDaysAgo: 6}
];

const WEEKDAY_STARTS = [
	7 * 60 + 50, 8 * 60 + 40, 9 * 60 + 30, 10 * 60 + 20, 11 * 60 + 10,
	13 * 60 + 40, 14 * 60 + 30, 15 * 60 + 20, 16 * 60 + 10, 17 * 60,
	20 * 60 + 30, 21 * 60 + 20, 22 * 60 + 10
];

const WEEKEND_STARTS = [
	9 * 60 + 30, 10 * 60 + 40, 11 * 60 + 30,
	15 * 60, 16 * 60 + 10, 17 * 60 + 20,
	20 * 60 + 30, 21 * 60 + 40
];

const DURATIONS = [
	{minutes: 9, weight: 8},
	{minutes: 14, weight: 12},
	{minutes: 19, weight: 14},
	{minutes: 24, weight: 12},
	{minutes: 31, weight: 14},
	{minutes: 38, weight: 12},
	{minutes: 47, weight: 9},
	{minutes: 56, weight: 7},
	{minutes: 68, weight: 5},
	{minutes: 82, weight: 3}
];

function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function pickWeighted<T extends {weight: number}>(random: () => number, items: T[]): T {
	const total = items.reduce((sum, item) => sum + item.weight, 0);
	let ticket = random() * total;
	for (const item of items) {
		ticket -= item.weight;
		if (ticket <= 0) {
			return item;
		}
	}
	return items[items.length - 1];
}

function chooseStarts(random: () => number, pool: number[], count: number): number[] {
	const copy = pool.slice();
	const picked: number[] = [];
	while (picked.length < count && copy.length > 0) {
		const index = Math.floor(random() * copy.length);
		picked.push(copy.splice(index, 1)[0]);
	}
	return picked.sort((a, b) => a - b);
}

function availableNotes(dateMs: number, todayMs: number): Array<{note: DemoNote; index: number}> {
	return NOTES
		.map((note, index) => ({note, index}))
		.filter((entry) => entry.note.sinceDaysAgo === undefined || dateMs >= todayMs - entry.note.sinceDaysAgo * 86_400_000);
}

function pickNote(
	random: () => number,
	pool: Array<{note: DemoNote; index: number}>,
	evening: boolean
): {note: DemoNote; index: number} {
	const weighted = pool.map((entry) => ({
		...entry,
		weight: evening ? entry.note.evening ?? 1 : entry.note.weight
	}));
	return pickWeighted(random, weighted);
}

function buildSessions(): SessionEvent[] {
	const random = mulberry32(20261123);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const now = Date.now();
	const start = DateUtils.addDays(today, -640);
	const sessions: SessionEvent[] = [];
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	let cursor = new Date(start);
	while (cursor <= today) {
		const date = new Date(cursor);
		const dateKey = DateUtils.toLocalDate(date);
		const weekday = date.getDay();
		const weekend = weekday === 0 || weekday === 6;
		const dayRandom = mulberry32(Number(dateKey.replace(/-/g, "")) + 7);

		const active = dayRandom() < (weekend ? 0.62 : 0.9);
		if (active) {
			const pool = weekend ? WEEKEND_STARTS : WEEKDAY_STARTS;
			const count = weekend
				? 1 + Math.floor(dayRandom() * 3)
				: 3 + Math.floor(dayRandom() * 4);
			const starts = chooseStarts(random, pool, count);
			const limit = weekend ? 23 * 60 : 23 * 60 + 20;
			const notes = availableNotes(date.getTime(), today.getTime());

			for (let index = 0; index < starts.length; index++) {
				const startMinute = starts[index];
				const next = index + 1 < starts.length ? starts[index + 1] : limit;
				const room = next - startMinute - 6;
				if (room < 8) {
					continue;
				}

				const duration = pickWeighted(random, DURATIONS).minutes;
				const minutes = Math.min(duration, room);
				const begin = new Date(date);
				begin.setMinutes(startMinute);
				const endMs = begin.getTime() + minutes * 60_000;
				if (begin.getTime() > now) {
					break;
				}
				const clippedEnd = Math.min(endMs, now);
				if (clippedEnd - begin.getTime() < 60_000) {
					continue;
				}

				const evening = startMinute >= 19 * 60;
				const picked = pickNote(random, notes, evening);
				const note = picked.note;

				sessions.push({
					v: 1,
					id: `demo-${dateKey}-${index}`,
					dev: "demo-laptop",
					at: clippedEnd,
					type: "session",
					ses: `demo-ses-${dateKey}-${index}`,
					note: `note-${picked.index + 1}`,
					path: note.path,
					start: begin.getTime(),
					end: clippedEnd,
					ms: clippedEnd - begin.getTime(),
					kind: note.kind,
					idle: "guard",
					tz: timezone
				});
			}
		}

		cursor = DateUtils.addDays(cursor, 1);
	}

	return sessions;
}

export interface DemoFixture {
	index: FocusIndex;
	paths: Map<string, string>;
	settings: FocusTimeSettings;
}

export function buildDemoFixture(): DemoFixture {
	const index = new FocusIndex();
	const events: FocusEvent[] = buildSessions();
	index.rebuild(events);

	const paths = new Map<string, string>();
	NOTES.forEach((note, position) => paths.set(`note-${position + 1}`, note.path));

	return {
		index,
		paths,
		settings: {
			strictMode: true,
			idleMode: "fixed",
			idleMinutes: 5,
			readingIdleMinutes: 10,
			dailyGoalMinutes: 120,
			showHelpIcons: true,
			language: "en"
		}
	};
}
