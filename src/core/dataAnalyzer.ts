import {App, Plugin, TFile} from "obsidian";
import {PluginDataManager} from "./pluginDataManager";
import {DailyReadDataManager} from "./dailyReadDataManager";

export class DataAnalyzer {

	private readonly app: App;
	private readonly dataManager: PluginDataManager;

	constructor(plugin: Plugin, app: App, dataManager: PluginDataManager, dailyReadDataManager: DailyReadDataManager) {
		this.app = app;
		this.dataManager = dataManager;

		// Change data reference when the file is renamed
		plugin.registerEvent(this.app.vault.on('rename', (absFile, oldPath) => {
			const file = this.app.vault.getFileByPath(absFile.path);
			if (!file) {
				return;
			}
			this.onFileRename(file, oldPath);
		}));
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

		const filteredLeaderboard = leaderboard.filter(item => {
			const file = this.app.vault.getFileByPath(item.filePath);
			if (!file) {
				return false; // File was deleted
			}
			// Filter out files with less than 1 minute
			return item.totalTime > 60 * 1000;
		});

		filteredLeaderboard.sort((a, b) => b.totalTime - a.totalTime);
		return filteredLeaderboard;
	}

	private onFileRename(file: TFile, oldPath: string) {
		const readData = this.dataManager.get('readData', oldPath);
		if (!readData) {
			return;
		}

		readData.filePath = file.path;
		this.dataManager.delete('readData', oldPath).finally();
		this.dataManager.put('readData', file.path, readData).finally();
	}

}
