/**
 * Minimal stand-in for the `obsidian` package so the dashboard can be rendered
 * outside the app. Only the pieces the view touches at import time are needed.
 */

export const moment = {
	locale: () => "en"
};

export class TFile {
	path = "";
}

export class ItemView {}

export class PluginSettingTab {}

export class Setting {}

export class Notice {
	constructor(_message?: string) {}
}

export class WorkspaceLeaf {}

export function normalizePath(path: string): string {
	return path;
}

export function setIcon(): void {}
