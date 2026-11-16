import { App, FileView, MarkdownView, Plugin, TFile } from "obsidian";
import { SettingsStore } from "./settings";
import { ActivityMonitor } from "./tracking/activityMonitor";
import { computeAccrual, MAX_TICK_MULTIPLIER, splitAcrossMidnight } from "./tracking/trackingMath";
import { PauseReason } from "./tracking/types";
import { StatusBarManager } from "../view/display/statusBar/statusBarManager";
import { StatusBarFactory } from "../view/display/statusBar/statusBarFactory";
import { StorageService } from "./storage/storageService";
import { newEventId } from "./storage/eventStore";

export type { PauseReason };

type FlushReason = "timer" | "switch" | "idle" | "blur" | "manual" | "unload" | "bucket-change";

const TICK_MS = 5000;
const FLUSH_MS = 30_000;
const PUBLISH_MS = 5 * 60 * 1000;
const MAX_DELTA_MS = TICK_MS * MAX_TICK_MULTIPLIER;

interface PendingBucket {
	file: TFile;
	filePath: string;
	date: string;
	ms: number;
	start: number;
	end: number;
	ses: string;
}

/**
 * Focus session engine.
 *
 * Counts real elapsed time, stops at `last input + idle threshold`, splits at
 * midnight, and writes one session segment per flush to the event log.
 */
export class TimeTracker {
	private readonly app: App;
	private readonly storage: StorageService;
	private readonly settings: SettingsStore;
	private readonly statusBarManager: StatusBarManager;
	private readonly activity: ActivityMonitor;

	private currentFile: TFile | null = null;
	private accruedUntil = Date.now();
	private pending: PendingBucket | null = null;
	private pauseReason: PauseReason | null = null;
	private manualPaused = false;
	private windowFocused = true;
	private documentVisible = true;
	private sessionId = newEventId("ses");
	private changeQueue: Promise<void> = Promise.resolve();

	constructor(
		plugin: Plugin,
		app: App,
		storage: StorageService,
		settings: SettingsStore
	) {
		this.app = app;
		this.storage = storage;
		this.settings = settings;
		this.statusBarManager = new StatusBarManager(plugin);
		this.activity = new ActivityMonitor(plugin, () => this.onActivity());

		this.windowFocused = true;
		this.documentVisible = document.visibilityState !== "hidden";
		this.currentFile = this.app.workspace.getActiveViewOfType(FileView)?.file ?? null;
		this.accruedUntil = Date.now();

		if (this.currentFile) {
			void this.storage.ensureNote(this.currentFile.path);
		}

		plugin.registerEvent(this.app.workspace.on("file-open", () => {
			void this.handleFileChange();
		}));
		plugin.registerEvent(this.app.workspace.on("active-leaf-change", () => {
			void this.handleFileChange();
		}));
		plugin.registerEvent(this.app.vault.on("rename", (_file, oldPath) => {
			this.handlePendingPathChange(oldPath, _file.path);
		}));
		plugin.registerInterval(window.setInterval(() => this.tick(), TICK_MS));
		plugin.registerInterval(window.setInterval(() => {
			void this.flush("timer");
		}, FLUSH_MS));
		plugin.registerInterval(window.setInterval(() => {
			void this.storage.flush();
		}, PUBLISH_MS));
		plugin.registerDomEvent(window, "blur", () => this.onBlur());
		plugin.registerDomEvent(window, "focus", () => this.onFocus());
		plugin.registerDomEvent(document, "visibilitychange", () => this.onVisibilityChange());
	}

	private tick(): void {
		const now = Date.now();

		if (!this.currentFile) {
			this.updateStatusBar();
			return;
		}
		if (!this.canTrack()) {
			this.accruedUntil = now;
			if (!this.manualPaused && (!this.documentVisible || !this.windowFocused)) {
				this.pauseReason = "blur";
			}
			this.updateStatusBar();
			return;
		}

		if (this.pauseReason === "blur") {
			this.pauseReason = null;
		}

		this.settle(now);

		if (this.pauseReason === "idle") {
			void this.flush("idle");
		}
		this.updateStatusBar();
	}

	private settle(now: number): void {
		if (!this.canTrack()) {
			this.accruedUntil = now;
			return;
		}

		const result = computeAccrual(
			now,
			this.accruedUntil,
			this.activity.getLastInputAt(),
			this.getIdleMs(),
			MAX_DELTA_MS
		);

		if (result.clockWentBackwards) {
			this.accruedUntil = now;
			return;
		}

		if (result.countedMs > 0) {
			this.addPending(result.from, result.to);
		}
		this.accruedUntil = result.to;

		if (result.idleReached) {
			this.pauseReason = "idle";
		}
	}

	private addPending(from: number, to: number): void {
		const file = this.currentFile;
		if (!file) {
			return;
		}

		for (const segment of splitAcrossMidnight(from, to)) {
			if (segment.ms <= 0) {
				continue;
			}
			if (!this.pending || this.pending.file !== file || this.pending.date !== segment.date) {
				void this.flush("bucket-change");
				this.pending = {
					file,
					filePath: file.path,
					date: segment.date,
					ms: 0,
					start: segment.from,
					end: segment.to,
					ses: this.sessionId
				};
			}
			this.pending.ms += segment.ms;
			this.pending.end = segment.to;
		}
	}

	private handlePendingPathChange(oldPath: string, newPath: string): void {
		if (!this.pending) {
			return;
		}
		const from = oldPath.endsWith("/") ? oldPath.slice(0, -1) : oldPath;
		const to = newPath.endsWith("/") ? newPath.slice(0, -1) : newPath;
		if (this.pending.filePath === from) {
			this.pending.filePath = to;
			return;
		}
		const prefix = `${from}/`;
		if (this.pending.filePath.startsWith(prefix)) {
			this.pending.filePath = `${to}/${this.pending.filePath.slice(prefix.length)}`;
		}
	}

	private resolvePendingPath(pending: PendingBucket): string {
		// The rename listener updates pending.filePath; prefer it while it still
		// exists. Fall back to the TFile path if the listener missed the event.
		if (this.app.vault.getAbstractFileByPath(pending.filePath)) {
			return pending.filePath;
		}
		return pending.file.path;
	}

	private async flush(reason: FlushReason): Promise<void> {
		const pending = this.pending;
		this.pending = null;
		if (!pending || pending.ms <= 0) {
			return;
		}

		const filePath = this.resolvePendingPath(pending);
		try {
			const noteId = await this.storage.ensureNote(filePath);
			await this.storage.recordSession({
				ses: pending.ses,
				note: noteId,
				path: filePath,
				start: pending.start,
				end: pending.end,
				ms: pending.ms,
				kind: this.activity.getLastEditAt() >= pending.start ? "edit" : "read",
				idle: this.getIdleMs() > 0 ? "guard" : "off"
			});
		} catch (error) {
			console.error(`[focus-time] Failed to flush focus data (${reason})`, error);
		}
	}

	public handleFileChange(): Promise<void> {
		this.changeQueue = this.changeQueue
			.catch(() => undefined)
			.then(() => this.doHandleFileChange());
		return this.changeQueue;
	}

	private async doHandleFileChange(): Promise<void> {
		const now = Date.now();
		this.settle(now);
		await this.flush("switch");

		const previous = this.currentFile;
		const active = this.app.workspace.getActiveViewOfType(FileView)?.file ?? null;
		this.currentFile = active;
		this.accruedUntil = now;

		if (active) {
			await this.storage.ensureNote(active.path);
			if (!previous || previous.path !== active.path) {
				this.sessionId = newEventId("ses");
			}
		}

		if (this.manualPaused) {
			this.pauseReason = "manual";
		} else if (this.canTrack()) {
			this.pauseReason = null;
		}

		this.updateStatusBar();
	}

	private onActivity(): void {
		if (this.pauseReason === "idle" && !this.manualPaused) {
			this.pauseReason = null;
			this.sessionId = newEventId("ses");
			this.accruedUntil = Date.now();
			this.updateStatusBar();
		}
	}

	private onBlur(): void {
		const now = Date.now();
		this.settle(now);
		void this.flush("blur");
		this.windowFocused = false;
		if (!this.manualPaused) {
			this.pauseReason = "blur";
		}
		this.accruedUntil = now;
		this.updateStatusBar();
	}

	private onFocus(): void {
		this.windowFocused = true;
		if (this.pauseReason === "blur" && !this.manualPaused) {
			this.pauseReason = null;
			this.sessionId = newEventId("ses");
		}
		this.accruedUntil = Date.now();
		this.updateStatusBar();
	}

	private onVisibilityChange(): void {
		const hidden = document.visibilityState === "hidden";
		const now = Date.now();

		if (hidden) {
			this.settle(now);
			void this.flush("blur");
			this.documentVisible = false;
			if (!this.manualPaused) {
				this.pauseReason = "blur";
			}
			this.accruedUntil = now;
		} else {
			this.documentVisible = true;
			if (!this.manualPaused) {
				this.pauseReason = this.canTrack() ? null : "blur";
				this.sessionId = newEventId("ses");
			}
			this.accruedUntil = now;
		}

		this.updateStatusBar();
	}

	private canTrack(): boolean {
		if (!this.currentFile) {
			return false;
		}
		if (this.manualPaused) {
			return false;
		}
		if (!this.documentVisible) {
			return false;
		}
		if (this.settings.get().strictMode && !this.windowFocused) {
			return false;
		}
		return true;
	}

	/**
	 * Reading mode and non-Markdown files use the reading idle threshold.
	 */
	private isReadingContext(): boolean {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			return view.getMode() === "preview";
		}
		return !!this.currentFile && this.currentFile.extension !== "md";
	}

	private getIdleMs(): number {
		return this.settings.getIdleMs(this.isReadingContext());
	}

	public toggleManualPause(): void {
		if (this.manualPaused) {
			this.manualPaused = false;
			this.pauseReason = this.canTrack() ? null : "blur";
			this.sessionId = newEventId("ses");
			this.accruedUntil = Date.now();
		} else {
			const now = Date.now();
			this.settle(now);
			void this.flush("manual");
			this.manualPaused = true;
			this.pauseReason = "manual";
			this.accruedUntil = now;
		}
		this.updateStatusBar();
	}

	public getTotalForCurrentFile(file: TFile): number {
		return this.storage.getTotalForPath(file.path);
	}

	private updateStatusBar(): void {
		const file = this.currentFile;
		if (!file) {
			this.statusBarManager.remove();
			return;
		}

		let total = this.storage.getTotalForPath(file.path);
		if (this.pending && this.pending.filePath === file.path) {
			total += this.pending.ms;
		}

		StatusBarFactory.createIconTextStatusBar(
			this.statusBarManager,
			total,
			this.pauseReason,
			this.settings.get().idleMinutes
		);
	}

	public unload(): void {
		this.settle(Date.now());
		void this.flush("unload");
		this.statusBarManager.remove();
		void this.storage.flush();
	}
}
