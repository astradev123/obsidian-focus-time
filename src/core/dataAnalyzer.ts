import {App, Plugin, TFile} from "obsidian";
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

		// Change data reference when the file is renamed
		this.app.vault.on('rename', (absFile, oldPath) => {
			const file = this.app.vault.getFileByPath(absFile.path);
			if (!file) {
				return;
			}
			this.onFileRename(file, oldPath);
		});
	}

	public analyzeLeaderboardTotal() {

		const readData = this.dataManager.getCategory("readData");

		if (!readData) {
			return;
		}

		const leaderboard = Object.keys(readData).map(fileId => {
			const fileRecord = readData[fileId];
			const totalTime = fileRecord.duration;
			const filePath = readData[fileId].filePath;
			return {
				fileRecord,
				filePath,
				totalTime,
			};
		});

		leaderboard.sort((a, b) => b.totalTime - a.totalTime)

		// Filter out less than 1 minutes
		return leaderboard.filter(item => item.totalTime > 60 * 1000);
	}

	private onFileRename(file: TFile, oldPath: string) {
		const readData = this.dataManager.get('readData', file.stat.ctime.toString());
		if (!readData) {
			return;
		}

		readData.filePath = file.path;
		this.dataManager.put('readData', file.stat.ctime.toString(), readData).finally();
	}

}
