import { normalizePath } from "obsidian";

export const DATA_FOLDER = "store";

let dataRoot = DATA_FOLDER;

/**
 * Keep plugin data out of the vault tree. Obsidian passes a manifest dir such
 * as `.obsidian/plugins/focus-time`.
 */
export function configureDataRoot(pluginDir: string): void {
	dataRoot = normalizePath(`${pluginDir}/${DATA_FOLDER}`);
}

export function dataRootPath(): string {
	return dataRoot;
}

export function dataPath(...parts: string[]): string {
	return normalizePath([dataRoot, ...parts].filter(Boolean).join("/"));
}

export function eventsPath(): string {
	return dataPath("events");
}

export function archivePath(...parts: string[]): string {
	return dataPath("archive", ...parts);
}

export function reportsPath(...parts: string[]): string {
	return dataPath("reports", ...parts);
}

export function exportsPath(...parts: string[]): string {
	return dataPath("exports", ...parts);
}

export function monthKey(ms: number): string {
	const date = new Date(ms);
	return `${date.getFullYear()}-${date.getMonth() + 1 < 10 ? "0" : ""}${date.getMonth() + 1}`;
}

export function monthKeyFromDate(date: string): string {
	return date.slice(0, 7);
}

export function shardPath(month: string, deviceId: string): string {
	return normalizePath(`${eventsPath()}/${month}.${deviceId}.jsonl`);
}

export const SHARD_PATTERN = /^\d{4}-\d{2}\.[a-z0-9-]+\.jsonl$/i;
