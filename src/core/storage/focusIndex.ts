import { DateUtils } from "../../util/dateUtils";
import { FocusEvent, SessionEvent } from "./types";

export interface NoteAggregate {
	ms: number;
	sessions: number;
	firstAt: number;
	lastAt: number;
	firstDay: string;
	lastDay: string;
}

export interface DayAggregate {
	date: string;
	totalMs: number;
	notes: Map<string, number>;
}

/**
 * In-memory aggregation over the append-only event log.
 * Rebuilt on startup and updated incrementally while tracking.
 */
export class FocusIndex {
	private readonly events = new Map<string, FocusEvent>();
	private readonly dayNotes = new Map<string, Map<string, number>>();
	private readonly noteTotals = new Map<string, number>();
	private readonly noteSessions = new Map<string, Set<string>>();
	private readonly noteFirstAt = new Map<string, number>();
	private readonly noteLastAt = new Map<string, number>();
	private readonly noteFirstDay = new Map<string, string>();
	private readonly noteLastDay = new Map<string, string>();
	private readonly legacyDates = new Set<string>();
	private readonly legacyBaseline = new Map<string, number>();
	private readonly sessions: SessionEvent[] = [];
	private legacyDayMs = 0;
	private legacyTotalMs = 0;
	private adjustMs = 0;
	private unmappedMs = 0;

	public rebuild(events: FocusEvent[]): void {
		this.events.clear();
		this.dayNotes.clear();
		this.noteTotals.clear();
		this.noteSessions.clear();
		this.noteFirstAt.clear();
		this.noteLastAt.clear();
		this.noteFirstDay.clear();
		this.noteLastDay.clear();
		this.legacyDates.clear();
		this.legacyBaseline.clear();
		this.sessions.length = 0;
		this.legacyDayMs = 0;
		this.legacyTotalMs = 0;
		this.adjustMs = 0;
		this.unmappedMs = 0;

		for (const event of events) {
			this.add(event);
		}
	}

	public add(event: FocusEvent): void {
		if (this.events.has(event.id)) {
			return;
		}
		this.events.set(event.id, event);

		switch (event.type) {
			case "session":
				this.addSession(event);
				break;
			case "legacyDay":
				this.addLegacyDay(event.date, event.note, event.ms);
				break;
			case "legacyTotal": {
				// Undated legacy totals are a baseline, not an additive series:
				// repeated imports of the same note must not double count.
				const previous = this.legacyBaseline.get(event.note) ?? 0;
				if (event.ms > previous) {
					this.legacyBaseline.set(event.note, event.ms);
					this.legacyTotalMs += event.ms - previous;
					this.addNoteTotal(event.note, event.ms - previous);
				}
				break;
			}
			case "adjust":
				this.adjustMs += event.ms;
				this.addNoteTotal(event.note, event.ms);
				break;
			default:
				break;
		}
	}

	public hasEvent(id: string): boolean {
		return this.events.has(id);
	}

	public getEventIds(): Set<string> {
		return new Set(this.events.keys());
	}

	public getDay(date: string): DayAggregate {
		const normalized = DateUtils.normalizeKey(date);
		const notes = this.dayNotes.get(normalized) ?? new Map<string, number>();
		let totalMs = 0;
		for (const ms of notes.values()) {
			totalMs += ms;
		}
		return {date: normalized, totalMs, notes};
	}

	public getDayTotal(date: string): number {
		return this.getDay(date).totalMs;
	}

	public getActiveDays(): string[] {
		return Array.from(this.dayNotes.keys()).sort();
	}

	public getNoteTotal(noteId: string): number {
		return Math.max(0, this.noteTotals.get(noteId) ?? 0);
	}

	public getNoteBaseline(noteId: string): number {
		return this.legacyBaseline.get(noteId) ?? 0;
	}

	public getNoteAggregate(noteId: string): NoteAggregate {
		return {
			ms: this.getNoteTotal(noteId),
			sessions: this.noteSessions.get(noteId)?.size ?? 0,
			firstAt: this.noteFirstAt.get(noteId) ?? 0,
			lastAt: this.noteLastAt.get(noteId) ?? 0,
			firstDay: this.noteFirstDay.get(noteId) ?? "",
			lastDay: this.noteLastDay.get(noteId) ?? ""
		};
	}

	public getNoteIds(): string[] {
		return Array.from(this.noteTotals.keys());
	}

	public getSessions(): SessionEvent[] {
		return this.sessions;
	}

	public isLegacyDate(date: string): boolean {
		return this.legacyDates.has(DateUtils.normalizeKey(date));
	}

	public getStats() {
		return {
			events: this.events.size,
			sessions: this.sessions.length,
			legacyDays: this.legacyDates.size,
			notes: this.noteTotals.size,
			legacyDayMs: this.legacyDayMs,
			legacyTotalMs: this.legacyTotalMs,
			adjustMs: this.adjustMs,
			unmappedMs: this.unmappedMs
		};
	}

	public getTotalMs(): number {
		let total = 0;
		for (const ms of this.noteTotals.values()) {
			total += ms;
		}
		return Math.max(0, total);
	}

	public addUnmapped(ms: number): void {
		this.unmappedMs += ms;
	}

	private addSession(event: SessionEvent): void {
		const date = DateUtils.toLocalDateFromMs(event.start);
		this.addDayMs(date, event.note, event.ms);

		const sessions = this.noteSessions.get(event.note) ?? new Set<string>();
		sessions.add(event.ses);
		this.noteSessions.set(event.note, sessions);

		const previousFirst = this.noteFirstAt.get(event.note);
		this.noteFirstAt.set(event.note, previousFirst === undefined ? event.start : Math.min(previousFirst, event.start));
		this.noteLastAt.set(event.note, Math.max(this.noteLastAt.get(event.note) ?? 0, event.end));
		this.sessions.push(event);
	}

	private addLegacyDay(date: string, noteId: string, ms: number): void {
		const normalized = DateUtils.normalizeKey(date);
		this.addDayMs(normalized, noteId, ms);
		this.legacyDates.add(normalized);
		this.legacyDayMs += ms;
	}

	private addDayMs(date: string, noteId: string, ms: number): void {
		const normalized = DateUtils.normalizeKey(date);
		let notes = this.dayNotes.get(normalized);
		if (!notes) {
			notes = new Map<string, number>();
			this.dayNotes.set(normalized, notes);
		}
		notes.set(noteId, (notes.get(noteId) ?? 0) + ms);
		this.addNoteTotal(noteId, ms);

		const firstDay = this.noteFirstDay.get(noteId);
		if (!firstDay || normalized < firstDay) {
			this.noteFirstDay.set(noteId, normalized);
		}
		const lastDay = this.noteLastDay.get(noteId);
		if (!lastDay || normalized > lastDay) {
			this.noteLastDay.set(noteId, normalized);
		}
	}

	private addNoteTotal(noteId: string, ms: number): void {
		this.noteTotals.set(noteId, (this.noteTotals.get(noteId) ?? 0) + ms);
	}
}
