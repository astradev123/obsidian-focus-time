import { Notice, Plugin } from 'obsidian';
import { FocusTimeSettingTab } from "./setting/focusTimeSettingTab";
import { CommandFactory } from "./command/commandFactory";
import I18n from "./language/i18n";
import { TimeTracker } from "./core/timeTracker";
import { PluginDataManager } from "./core/pluginDataManager";
import { DailyReadDataManager } from "./core/dailyReadDataManager";
import { DataAnalyzer } from "./core/dataAnalyzer";
import { RibbonFactory } from "./view/display/ribbon/ribbonFactory";
import { FocusDataAggregator } from "./core/focusDataAggregator";
import { SettingsStore } from "./core/settings";
import { StorageService } from "./core/storage/storageService";
import { resolveDeviceId } from "./core/storage/deviceId";
import { FOCUS_DASHBOARD_VIEW, FocusDashboardView } from "./view/dashboard/FocusDashboardView";
import { Exporter } from "./core/export/exporter";
import { getRangeStats } from "./analytics/metrics";
import { getRange, Period } from "./analytics/period";
import { DateUtils } from "./util/dateUtils";
import { TimeUtils } from "./util/timeUtils";

export default class FocusTimePlugin extends Plugin {
	private _dataManager: PluginDataManager;
	private _settingsManager: SettingsStore;
	private _dataAnalyzer: DataAnalyzer;
	private _focusDataAggregator: FocusDataAggregator;
	private _storage: StorageService;
	private _exporter: Exporter;
	private dailyReadDataManager: DailyReadDataManager;
	private timeTracker: TimeTracker | null = null;
	private settingTab: FocusTimeSettingTab | null = null;

	get dataAnalyzer(): DataAnalyzer {
		return this._dataAnalyzer;
	}

	get dataManager(): PluginDataManager {
		return this._dataManager;
	}

	get settingsManager(): SettingsStore {
		return this._settingsManager;
	}

	get focusDataAggregator(): FocusDataAggregator {
		return this._focusDataAggregator;
	}

	get storage(): StorageService {
		return this._storage;
	}

	get exporter(): Exporter {
		return this._exporter;
	}

	async onload() {
		this._dataManager = new PluginDataManager(this);
		await this._dataManager.loadData();

		this._settingsManager = new SettingsStore(this._dataManager);
		await this._settingsManager.load();
		this.applyLanguagePreference();

		// Repair legacy v0 fields once, before the migration reads them.
		await this._dataManager.normalizeLegacyData(this.app);

		this.dailyReadDataManager = new DailyReadDataManager(this);
		const pluginDir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
		const deviceId = resolveDeviceId(this.app.vault.getName());
		this._storage = new StorageService(
			this.app,
			pluginDir,
			deviceId,
			this._dataManager,
			this.dailyReadDataManager
		);

		// Register before layout restore so a saved dashboard leaf can reopen.
		this.registerView(FOCUS_DASHBOARD_VIEW, (leaf) => new FocusDashboardView(leaf, this));

		this.app.workspace.onLayoutReady(() => {
			void this.initializeStorageAndUi();
		});
	}

	onunload() {
		this.timeTracker?.unload();
		if (this._storage) {
			void this._storage.flush();
		}
		if (this._dataManager) {
			void this._dataManager.flush();
		}
	}

	/**
	 * Obsidian calls this when `data.json` changed outside this instance.
	 */
	async onExternalSettingsChange() {
		if (!this._dataManager || !this._settingsManager) {
			return;
		}
		await this._dataManager.mergeFromDisk();
		await this._settingsManager.load();
		this.applyLanguagePreference();
		this.settingTab?.display();
	}

	public applyLanguagePreference() {
		const preference = this._settingsManager.get().language;
		I18n.getInstance().setLanguage(preference === "auto" ? I18n.autoDetectLanguage() : preference);
	}

	public toggleFocusTracking() {
		this.timeTracker?.toggleManualPause();
	}

	public async rescanLegacy(): Promise<number> {
		const migration = await this._storage.retryMigrationIfNeeded();
		if (migration) {
			return migration.importedEvents;
		}
		const imported = await this._storage.importNewLegacy();
		await this._storage.reloadIndex();
		return imported;
	}

	private async initializeStorageAndUi(): Promise<void> {
		let migrating = false;
		try {
			migrating = await this._storage.needsMigration();
			if (migrating) {
				new Notice(I18n.t("notice.migrating"));
			}
			await this._storage.init();
			if (migrating) {
				new Notice(I18n.t("notice.migrated"));
			}
		} catch (error) {
			console.error("[focus-time] Storage initialization failed", error);
			new Notice(I18n.t("notice.migrationFailed"));
		}

		this.init();

		this.registerInterval(window.setInterval(() => {
			void this.checkExternalEvents();
		}, 60_000));
	}

	private async checkExternalEvents(): Promise<void> {
		if (!this._storage) {
			return;
		}
		try {
			if (await this._storage.checkForExternalChanges()) {
				await this._storage.reloadIndex();
			}
		} catch (error) {
			console.error("[focus-time] Failed to refresh focus events", error);
		}
	}

	private init() {
		this.timeTracker = new TimeTracker(
			this,
			this.app,
			this._storage,
			this._settingsManager
		);
		this._dataAnalyzer = new DataAnalyzer(this, this.app, this._storage);
		this._focusDataAggregator = new FocusDataAggregator(this.app, this._storage);
		this._exporter = new Exporter(this._storage, this._storage.files);

		this.registerMarkdownCodeBlockProcessor("focus-time", (source, el, ctx) => {
			this.renderFocusBlock(source, el, ctx.sourcePath);
		});

		this.settingTab = new FocusTimeSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		RibbonFactory.createLeaderboardRibbon(this, this.app);
		new CommandFactory(this, this.app).create();
	}

	public async exportCsv(): Promise<void> {
		const path = await this._exporter.exportCsv();
		new Notice(I18n.t("notice.exported", {path}));
	}

	public async exportJson(): Promise<void> {
		const path = await this._exporter.exportJson();
		new Notice(I18n.t("notice.exported", {path}));
	}

	public async exportMarkdown(): Promise<void> {
		const path = await this._exporter.exportMarkdown("week");
		new Notice(I18n.t("notice.exported", {path}));
	}

	public async writeFrontmatter(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			new Notice(I18n.t("notice.noActiveNote"));
			return;
		}

		const noteId = this._storage.registry.getId(file.path);
		const total = noteId ? this._storage.index.getNoteTotal(noteId) : 0;
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter.focus_total = Math.round(total / 60_000);
			frontmatter.focus_updated = DateUtils.toLocalDate();
		});
		new Notice(I18n.t("notice.frontmatterDone"));
	}

	private renderFocusBlock(source: string, el: HTMLElement, sourcePath: string): void {
		const mode = source.trim().toLowerCase() || "week";
		let total = 0;
		let sessions = 0;
		let label = I18n.t("embed.week");

		if (mode === "note") {
			const noteId = this._storage.registry.getId(sourcePath);
			total = noteId ? this._storage.index.getNoteTotal(noteId) : 0;
			sessions = noteId ? this._storage.index.getNoteAggregate(noteId).sessions : 0;
			label = I18n.t("embed.note");
		} else if (mode === "total") {
			total = this._storage.index.getTotalMs();
			sessions = this._storage.index.getStats().sessions;
			label = I18n.t("embed.total");
		} else {
			const period: Period = mode === "today" ? "day" : mode === "month" ? "month" : "week";
			const stats = getRangeStats(
				this._storage.index,
				getRange(period, new Date()),
				(noteId) => this._storage.getPath(noteId)
			);
			total = stats.totalMs;
			sessions = stats.sessionCount;
			label = I18n.t(period === "day" ? "embed.today" : period === "month" ? "embed.month" : "embed.week");
		}

		el.empty();
		el.classList.add("ft-embed");
		el.createDiv({cls: "ft-embed-title", text: I18n.t("embed.title")});
		const row = el.createDiv({cls: "ft-embed-row"});
		row.createSpan({cls: "ft-embed-label", text: I18n.t("embed.total")});
		row.createSpan({cls: "ft-embed-value", text: TimeUtils.getFormattedReadingTime(total)});
		el.createDiv({cls: "ft-embed-meta", text: `${label} · ${I18n.t("embed.sessions")}: ${sessions}`});
	}
}
