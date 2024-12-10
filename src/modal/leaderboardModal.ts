import {App, Modal, normalizePath, Notice} from "obsidian";
import I18n from "../language/i18n";
import FocusTimePlugin from "../main";
import {TimeUtils} from "../util/timeUtils";
import i18n from "../language/i18n";

export class LeaderboardModal extends Modal {
	private readonly plugin: FocusTimePlugin;
	constructor(plugin: FocusTimePlugin, app: App) {
        super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;contentEl.empty();

		contentEl.createEl("h2", {
			text: I18n.t('leaderboardTitle'),
			cls: 'leaderboard-modal-title'
		});

		const leaderboardData = this.plugin.dataAnalyzer.analyzeLeaderboardTotal();

		if (!leaderboardData || leaderboardData.length === 0) {
			contentEl.createEl("p", {
				text: i18n.t('leaderboardNoData'),
				cls: 'leaderboard-no-data'
			});
			contentEl.createEl("p", {
				text: i18n.t('leaderboardNoData2'),
				cls: 'leaderboard-no-data'
			});
			return;
		}

		const leaderboardContainer = contentEl.createDiv({
			cls: "leaderboard-container",
		})

		leaderboardData.forEach((item, index) => {
			const formattedReadTime = TimeUtils.getFormattedReadingTime(item.totalTime);

			const entry = leaderboardContainer.createDiv({
				cls: "leaderboard-entry",
			});

			entry.addEventListener("click", () => {
				this.openFileInWorkspace(item);
				this.close();
			});

			entry.createEl("span", {
				text: `${index + 1}. ` + this.getFormattedNoteName(item.filePath),
				title: item.filePath,
				cls: "leaderboard-file-name",
			});

			entry.createEl("span", {
				text: formattedReadTime,
				cls: "leaderboard-time",
			});
		});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}

	private openFileInWorkspace(item: any) {
		const file = this.app.vault.getFileByPath(normalizePath(item.fileRecord.filePath));
		if(!file) {
			new Notice(i18n.t('fileNotFound'));
			return;
		}
		this.app.workspace.getLeaf().openFile(file).finally();
	}

	private getFormattedNoteName(filePath: string) {
		const noteName = filePath.split("/").pop() ?? "";
		if (noteName.length > 25) {
			return noteName.substring(0, 25) + "...";
		} else {
			return noteName;
		}
	}
}
