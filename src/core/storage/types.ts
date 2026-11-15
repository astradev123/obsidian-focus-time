export type EventType = "session" | "adjust" | "rename" | "legacyDay" | "legacyTotal";

export interface EventBase {
	v: 1;
	id: string;
	dev: string;
	at: number;
	type: EventType;
}

export interface SessionEvent extends EventBase {
	type: "session";
	ses: string;
	note: string;
	path: string;
	start: number;
	end: number;
	ms: number;
	kind: "edit" | "read";
	idle: "guard" | "off";
	tz: string;
}

export interface AdjustEvent extends EventBase {
	type: "adjust";
	note: string;
	ms: number;
	reason: "idle" | "manual" | "suspect" | "merge";
}

export interface RenameEvent extends EventBase {
	type: "rename";
	note: string;
	from: string;
	to: string;
}

export interface LegacyDayEvent extends EventBase {
	type: "legacyDay";
	key: string;
	note: string;
	date: string;
	ms: number;
	src: "v0";
	path?: string;
}

export interface LegacyTotalEvent extends EventBase {
	type: "legacyTotal";
	note: string;
	ms: number;
	src: "v0-readData";
	path?: string;
}

export type FocusEvent = SessionEvent | AdjustEvent | RenameEvent | LegacyDayEvent | LegacyTotalEvent;

export interface SessionInput {
	ses: string;
	note: string;
	path: string;
	start: number;
	end: number;
	ms: number;
	kind: "edit" | "read";
	idle: "guard" | "off";
}
