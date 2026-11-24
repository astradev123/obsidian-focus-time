/**
 * Minimal Obsidian API mock for unit tests.
 * Only the members used by pure logic are implemented.
 */
export const moment = {
	locale: () => "en"
};

export function normalizePath(input: string): string {
	return input.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export class App {}

export class Plugin {}

export class TFile {
	constructor(public path = "") {}
}

export class TFolder {
	constructor(public path = "") {}
}

export class Notice {
	constructor(public message: string) {}
}

export function setIcon(): void {
	// no-op
}
