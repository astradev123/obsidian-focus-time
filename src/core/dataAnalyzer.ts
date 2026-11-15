import { App, Plugin, TFile, TFolder } from "obsidian";
import { StorageService } from "./storage/storageService";

export interface LeaderboardItem {
	fileRecord: { fileId: string; filePath: string; duration: number };
	filePath: string;
	totalTime: number;
}

export class DataAnalyzer {
	private readonly app: App;
	private readonly storage: StorageService;

	constructor(plugin: Plugin, app: App, storage: StorageService) {
		this.app = app;
		this.storage = storage;

		plugin.registerEvent(this.app.vault.on("rename", (absFile, oldPath) => {
			if (absFile instanceof TFolder) {
				void this.storage.handleFolderRename(oldPath, absFile.path);
				return;
			}
			if (absFile instanceof TFile) {
				void this.storage.handleRename(oldPath, absFile.path);
			}
		}));
	}

	public analyzeLeaderboardTotal(): LeaderboardItem[] | undefined {
		const items: LeaderboardItem[] = [];

		for (const noteId of this.storage.index.getNoteIds()) {
			const filePath = this.storage.getPath(noteId);
			if (!filePath || !this.app.vault.getFileByPath(filePath)) {
				continue;
			}

			const totalTime = this.storage.index.getNoteTotal(noteId);
			if (totalTime <= 60 * 1000) {
				continue;
			}

			items.push({
				fileRecord: {fileId: noteId, filePath, duration: totalTime},
				filePath,
				totalTime
			});
		}

		items.sort((a, b) => b.totalTime - a.totalTime);
		return items;
	}
}
