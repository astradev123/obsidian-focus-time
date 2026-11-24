import { DailyReadDataManager } from "../dailyReadDataManager";
import { PluginDataManager } from "../pluginDataManager";
import { DateUtils } from "../../util/dateUtils";
import { FocusEvent } from "./types";

export interface LegacyNote {
	id: string;
	path: string;
	totalMs: number;
	residualMs: number;
}

export interface LegacyDayEntry {
	date: string;
	noteId: string;
	ms: number;
}

export interface LegacyScan {
	notes: LegacyNote[];
	days: LegacyDayEntry[];
	unmappedMs: number;
	dailyFiles: number;
}

interface V0Record {
	fileId?: string;
	id?: string;
	duration?: number;
	[key: string]: unknown;
}

function hash(input: string): string {
	let value = 2166136261;
	for (let i = 0; i < input.length; i++) {
		value ^= input.charCodeAt(i);
		value = Math.imul(value, 16777619);
	}
	return (value >>> 0).toString(36);
}

/**
 * Read the v0 store without modifying it.
 */
export async function scanLegacy(
	dataManager: PluginDataManager,
	dailyManager: DailyReadDataManager
): Promise<LegacyScan> {
	const readData = dataManager.getCategory("readData") as Record<string, V0Record> | undefined;
	const pathById = new Map<string, string>();
	const notes: LegacyNote[] = [];

	if (readData) {
		for (const path of Object.keys(readData)) {
			const record = readData[path];
			const id = record?.fileId || record?.id;
			if (!id) {
				continue;
			}
			const noteId = String(id);
			pathById.set(noteId, path);
			notes.push({
				id: noteId,
				path,
				totalMs: Number(record.duration) || 0,
				residualMs: 0
			});
		}
	}

	const dates = await dailyManager.listDates();
	const days: LegacyDayEntry[] = [];
	const sumByNote = new Map<string, number>();
	let unmappedMs = 0;

	for (const date of dates) {
		const day = await dailyManager.loadDailyData(date);
		const daily = day.dailyReadData as Record<string, V0Record> | undefined;
		if (!daily) {
			continue;
		}

		for (const noteId of Object.keys(daily)) {
			const ms = Number(daily[noteId]?.duration) || 0;
			if (ms <= 0) {
				continue;
			}
			if (!pathById.has(noteId)) {
				unmappedMs += ms;
				continue;
			}
			days.push({date: DateUtils.normalizeKey(date), noteId, ms});
			sumByNote.set(noteId, (sumByNote.get(noteId) ?? 0) + ms);
		}
	}

	for (const note of notes) {
		const dailySum = sumByNote.get(note.id) ?? 0;
		// Daily files are the more reliable source when data.json is stale.
		note.totalMs = Math.max(note.totalMs, dailySum);
		note.residualMs = Math.max(0, note.totalMs - dailySum);
	}

	return {notes, days, unmappedMs, dailyFiles: dates.length};
}

/**
 * Convert a v0 scan into idempotent legacy events.
 */
export function buildLegacyEvents(scan: LegacyScan, deviceId: string): FocusEvent[] {
	const at = Date.now();
	const events: FocusEvent[] = [];
	const seen = new Set<string>();

	for (const entry of scan.days) {
		const key = hash(`${entry.date}|${entry.noteId}|${entry.ms}`);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		events.push({
			v: 1,
			id: `legacy_${key}`,
			dev: deviceId,
			at,
			type: "legacyDay",
			key,
			note: entry.noteId,
			date: entry.date,
			ms: entry.ms,
			src: "v0"
		});
	}

	for (const note of scan.notes) {
		if (note.residualMs <= 0) {
			continue;
		}
		const key = hash(`${note.id}|residual|${note.residualMs}`);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		events.push({
			v: 1,
			id: `legacy_${key}`,
			dev: deviceId,
			at,
			type: "legacyTotal",
			note: note.id,
			ms: note.residualMs,
			src: "v0-readData",
			path: note.path
		});
	}

	return events;
}

export interface LegacyVerification {
	ok: boolean;
	noteMismatches: Array<{ noteId: string; expected: number; actual: number }>;
	dayMismatches: Array<{ date: string; expected: number; actual: number }>;
}

/**
 * Verify that imported events reproduce the v0 totals exactly.
 */
export function verifyLegacy(
	scan: LegacyScan,
	getNoteTotal: (noteId: string) => number,
	getDayTotal: (date: string) => number
): LegacyVerification {
	const noteMismatches: Array<{ noteId: string; expected: number; actual: number }> = [];
	const dayMismatches: Array<{ date: string; expected: number; actual: number }> = [];

	for (const note of scan.notes) {
		const actual = getNoteTotal(note.id);
		if (actual !== note.totalMs) {
			noteMismatches.push({noteId: note.id, expected: note.totalMs, actual});
		}
	}

	const dayExpected = new Map<string, number>();
	for (const day of scan.days) {
		dayExpected.set(day.date, (dayExpected.get(day.date) ?? 0) + day.ms);
	}
	for (const [date, expected] of dayExpected) {
		const actual = getDayTotal(date);
		if (actual !== expected) {
			dayMismatches.push({date, expected, actual});
		}
	}

	return {
		ok: noteMismatches.length === 0 && dayMismatches.length === 0,
		noteMismatches: noteMismatches.slice(0, 20),
		dayMismatches: dayMismatches.slice(0, 20)
	};
}

/**
 * Convert a scan into a compact report (no raw per-note array).
 */
export function summarizeScan(scan: LegacyScan) {
	return {
		notes: scan.notes.length,
		days: scan.days.length,
		dailyFiles: scan.dailyFiles,
		totalMs: scan.notes.reduce((sum, note) => sum + note.totalMs, 0),
		unmappedMs: scan.unmappedMs,
		residualMs: scan.notes.reduce((sum, note) => sum + note.residualMs, 0)
	};
}
