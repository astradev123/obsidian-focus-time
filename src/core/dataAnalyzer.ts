import {App, Plugin} from "obsidian";
import {PluginDataManager} from "./pluginDataManager";
import {DailyReadDataManager} from "./dailyReadDataManager";

export class DataAnalyzer {

	private readonly plugin: Plugin;
	private readonly app: App;
	private readonly dataManager: PluginDataManager;
	private readonly dailyReadDataManager: DailyReadDataManager;

	constructor(plugin: Plugin, app: App, dataManager: PluginDataManager, dailyReadDataManager: DailyReadDataManager) {
		this.plugin = plugin;
		this.app = app;
		this.dataManager = dataManager;
		this.dailyReadDataManager = dailyReadDataManager;
	}

	public analyzeLeaderboardTotal() {

		const readData = this.dataManager.getCategory("readData");

		if(!readData) return;

		const leaderboard = Object.keys(readData).map(fileId => {
			const fileRecord = readData[fileId];
			const totalTime = fileRecord.duration;
			const filePath = this.getFormattedNoteName(readData[fileId].filePath);
			return {
				fileRecord,
				filePath,
				totalTime,
			};
		});

		// Top 10 sort
		leaderboard.sort((a, b) => b.totalTime - a.totalTime)

		// Filter out less than 5 minutes
		return leaderboard.filter(item => item.totalTime > 5 * 60 * 1000).slice(0, 10);
	}

	private getFormattedNoteName(fileName: string) {
		const fileNameWithoutSuffix = fileName.split(".")[0];
		if (fileNameWithoutSuffix.length > 20) {
			return fileNameWithoutSuffix.substring(0, 20) + "...";
		} else {
			return fileNameWithoutSuffix;
		}
	}

}
