import { Plugin } from "obsidian";

type ActivityCallback = () => void;

/**
 * Tracks the last real user interaction.
 *
 * Keyboard, pointer, wheel, touch and editor changes all count as activity.
 * Scrolling matters for reading mode, where the user may not type for minutes.
 */
export class ActivityMonitor {
	private lastInputAt = Date.now();
	private lastEditAt = 0;
	private lastNotifiedAt = 0;

	constructor(
		plugin: Plugin,
		private readonly onActivity: ActivityCallback
	) {
		const handler = () => this.noteActivity();

		plugin.registerDomEvent(window, "keydown", handler, { capture: true, passive: true });
		plugin.registerDomEvent(window, "mousedown", handler, { capture: true, passive: true });
		plugin.registerDomEvent(window, "wheel", handler, { capture: true, passive: true });
		plugin.registerDomEvent(window, "touchstart", handler, { capture: true, passive: true });
		plugin.registerDomEvent(document, "selectionchange", this.throttle(handler, 1000), { capture: true, passive: true });
		plugin.registerEvent(plugin.app.workspace.on("editor-change", () => {
			this.lastEditAt = Date.now();
			handler();
		}));
	}

	public getLastInputAt(): number {
		return this.lastInputAt;
	}

	public getLastEditAt(): number {
		return this.lastEditAt;
	}

	public getMsSinceLastInput(now: number = Date.now()): number {
		return Math.max(0, now - this.lastInputAt);
	}

	private noteActivity(): void {
		this.lastInputAt = Date.now();

		// Avoid re-rendering the status bar on every keystroke.
		const now = this.lastInputAt;
		if (now - this.lastNotifiedAt < 500) {
			return;
		}
		this.lastNotifiedAt = now;
		this.onActivity();
	}

	private throttle<T extends (...args: never[]) => void>(fn: T, waitMs: number): T {
		let last = 0;
		return ((...args: never[]) => {
			const now = Date.now();
			if (now - last < waitMs) {
				return;
			}
			last = now;
			fn(...args);
		}) as T;
	}
}
