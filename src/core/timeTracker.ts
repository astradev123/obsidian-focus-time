import { App, Plugin, TFile } from "obsidian";
import { ReadRecord } from "../interface/readRecord";
import { PluginDataManager } from "./pluginDataManager";
import { DailyReadDataManager } from "./dailyReadDataManager";
import { SettingsStore } from "./settings";
import { ActivityMonitor } from "./tracking/activityMonitor";
import { computeAccrual, MAX_TICK_MULTIPLIER, splitAcrossMidnight } from "./tracking/trackingMath";
import { PauseReason } from "./tracking/types";
import { StatusBarManager } from "../view/display/statusBar/statusBarManager";
import { StatusBarFactory } from "../view/display/statusBar/statusBarFactory";

export type { PauseReason };

type FlushReason = "timer" | "switch" | "idle" | "blur" | "manual" | "unload" | "bucket-change";

const TICK_MS = 5000;
const FLUSH_MS = 30_000;
const MAX_DELTA_MS = TICK_MS * MAX_TICK_MULTIPLIER;

interface PendingBucket {
	file: TFile;
	filePath: string;
	date: string;
	ms: number;
}

/**
 * Focus session engine (v0 storage).
 *
 * Key differences from the old implementation:
 * - counts real elapsed time instead of adding a fixed 6 seconds per tick;
 * - stops at `last input + idle threshold`, not when idle is noticed;
 * - settles exactly when switching notes, and splits at local midnight;
 * - batches writes instead of rewriting `data.json` every 6 seconds.
 */
export class TimeTracker {
	private readonly app: App;
	private readonly dataManager: PluginDataManager;
	private readonly dailyManager: DailyReadDataManager;
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

	constructor(
		plugin: Plugin,
		app: App,
		dataManager: PluginDataManager,
		dailyManager: DailyReadDataManager,
		settings: SettingsStore
	) {
		this.app = app;
		this.dataManager = dataManager;
		this.dailyManager = dailyManager;
		this.settings = settings;
		this.statusBarManager = new StatusBarManager(plugin);
		this.activity = new ActivityMonitor(plugin, () => this.onActivity());

		this.windowFocused = true;
		this.documentVisible = document.visibilityState !== "hidden";
		this.currentFile = this.app.workspace.getActiveFile();
		this.accruedUntil = Date.now();

		plugin.registerEvent(this.app.workspace.on("file-open", () => {
			void this.handleFileChange();
		}));
		plugin.registerInterval(window.setInterval(() => this.tick(), TICK_MS));
		plugin.registerInterval(window.setInterval(() => {
			void this.flush("timer");
		}, FLUSH_MS));
		plugin.registerDomEvent(window, "blur", () => this.onBlur());
		plugin.registerDomEvent(window, "focus", () => this.onFocus());
		plugin.registerDomEvent(document, "visibilitychange", () => this.onVisibilityChange());
	}

	/**
	 * One tick: accrue elapsed time up to the idle cutoff, then reconcile state.
	 */
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

	/**
	 * Accrue time from `accruedUntil` to `now`, respecting the idle cutoff.
	 */
	private settle(now: number): void {
		if (!this.canTrack()) {
			this.accruedUntil = now;
			return;
		}

		const result = computeAccrual(
			now,
			this.accruedUntil,
			this.activity.getLastInputAt(),
			this.settings.getIdleMs(),
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

	/**
	 * Add a time range to the pending bucket, splitting at local midnight.
	 */
	private addPending(from: number, to: number): void {
		const file = this.currentFile;
		if (!file) {
			return;
		}

		for (const segment of splitAcrossMidnight(from, to)) {
			if (segment.ms <= 0) {
				continue;
			}
			if (!this.pending || this.pending.filePath !== file.path || this.pending.date !== segment.date) {
				void this.flush("bucket-change");
				this.pending = {
					file,
					filePath: file.path,
					date: segment.date,
					ms: 0
				};
			}
			this.pending.ms += segment.ms;
		}
	}

	/**
	 * Persist the pending bucket. The bucket is detached synchronously so a
	 * concurrent tick cannot mutate it while the async write is in flight.
	 */
	private async flush(reason: FlushReason): Promise<void> {
		const pending = this.pending;
		this.pending = null;
		if (!pending || pending.ms <= 0) {
			return;
		}

		try {
			const noteId = await this.dataManager.ensureNote(pending.filePath);
			await this.dailyManager.addDuration(pending.date, noteId, pending.ms);
			await this.dataManager.addDuration(pending.filePath, noteId, pending.ms);
		} catch (error) {
			console.error(`[focus-time] Failed to flush focus data (${reason})`, error);
		}
	}

	public async handleFileChange(): Promise<void> {
		const now = Date.now();
		this.settle(now);
		await this.flush("switch");

		const previous = this.currentFile;
		const active = this.app.workspace.getActiveFile();
		this.currentFile = active;
		this.accruedUntil = now;

		if (active) {
			await this.dataManager.ensureNote(active.path);
			if (!previous || previous.path !== active.path) {
				await this.dataManager.incrementOpenCount(active.path);
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

	public toggleManualPause(): void {
		if (this.manualPaused) {
			this.manualPaused = false;
			this.pauseReason = this.canTrack() ? null : "blur";
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

	public getTotalReadData(file: TFile): ReadRecord | undefined {
		return this.dataManager.get("readData", file.path) as ReadRecord | undefined;
	}

	private updateStatusBar(): void {
		const file = this.currentFile;
		if (!file) {
			this.statusBarManager.remove();
			return;
		}

		const record = this.getTotalReadData(file);
		let total = record ? Number(record.duration) || 0 : 0;
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
		void this.dataManager.flush();
	}
}
