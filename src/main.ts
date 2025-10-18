import {Plugin} from 'obsidian';
import {FocusTimeSettingTab} from "./setting/focusTimeSettingTab";
import {CommandFactory} from "./command/commandFactory";
import I18n from "./language/i18n";
import {TimeTracker} from "./core/timeTracker";
import {PluginDataManager} from "./core/pluginDataManager";
import {DailyReadDataManager} from "./core/dailyReadDataManager";
import {DataAnalyzer} from "./core/dataAnalyzer";
import {RibbonFactory} from "./view/display/ribbon/ribbonFactory";
import {FocusDataAggregator} from "./core/focusDataAggregator";

export default class FocusTimePlugin extends Plugin {
	get dataAnalyzer(): DataAnalyzer {
		return this._dataAnalyzer;
	}

	get dataManager(): PluginDataManager {
		return this._dataManager;
	}

	get focusDataAggregator(): FocusDataAggregator {
		return this._focusDataAggregator;
	}

	private timeTracker: TimeTracker;
	private _dataManager: PluginDataManager;
	private dailyReadDataManager: DailyReadDataManager;
	private _dataAnalyzer: DataAnalyzer;
	private _focusDataAggregator: FocusDataAggregator;

	async onload() {

		this._dataManager = new PluginDataManager(this);
		this.dailyReadDataManager = new DailyReadDataManager(this.app);

		this.dataManager.loadData().then(() => {
			this.init();
		});

	}

	onunload() {
		this.timeTracker.unload();
	}

	/**
	 * Initialize the plugin
	 * @private
	 */
	private init() {
		this.setLanguage();
		this.timeTracker = new TimeTracker(this, this.app, this._dataManager, this.dailyReadDataManager);
		this._dataAnalyzer = new DataAnalyzer(this, this.app, this._dataManager, this.dailyReadDataManager);
		this._focusDataAggregator = new FocusDataAggregator(this.app, this._dataManager, this.dailyReadDataManager);
		this.addSettingTab(new FocusTimeSettingTab(this.app, this));
		RibbonFactory.createLeaderboardRibbon(this, this.app);

		// Init commands
		const commandFactory = new CommandFactory(this, this.app);
		commandFactory.create();

	}

	/**
	 * Set the language of the plugin
	 * @private
	 */
	private setLanguage() {
		I18n.getInstance().setLanguage(I18n.autoDetectLanguage());
	}

}

