import { Plugin } from 'obsidian';
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

export default class FocusTimePlugin extends Plugin {
	private _dataManager: PluginDataManager;
	private _settingsManager: SettingsStore;
	private _dataAnalyzer: DataAnalyzer;
	private _focusDataAggregator: FocusDataAggregator;
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

	async onload() {
		this._dataManager = new PluginDataManager(this);
		await this._dataManager.loadData();

		this._settingsManager = new SettingsStore(this._dataManager);
		await this._settingsManager.load();
		this.applyLanguagePreference();

		// Repair legacy fields once, before any new data is written.
		await this._dataManager.normalizeLegacyData(this.app);

		// Wait for the workspace so the active file and leaf APIs are ready.
		this.app.workspace.onLayoutReady(() => this.init());
	}

	onunload() {
		this.timeTracker?.unload();
		if (this._dataManager) {
			void this._dataManager.flush();
		}
	}

	/**
	 * Obsidian calls this when `data.json` changed outside this instance
	 * (another device, a sync client, or a manual edit). Replaces the old
	 * 3-second `stat()` polling loop.
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

	private init() {
		this.dailyReadDataManager = new DailyReadDataManager(this);
		this.timeTracker = new TimeTracker(
			this,
			this.app,
			this._dataManager,
			this.dailyReadDataManager,
			this._settingsManager
		);
		this._dataAnalyzer = new DataAnalyzer(this, this.app, this._dataManager, this.dailyReadDataManager);
		this._focusDataAggregator = new FocusDataAggregator(this.app, this._dataManager, this.dailyReadDataManager);

		this.settingTab = new FocusTimeSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		RibbonFactory.createLeaderboardRibbon(this, this.app);
		new CommandFactory(this, this.app).create();
	}
}
