import {App} from 'obsidian';
import {LeaderboardModal} from "../view/display/modal/leaderboardModal";
import FocusTimePlugin from "../main";
export class CommandFactory {

	private plugin: FocusTimePlugin;

	private app: App;

	constructor(plugin: FocusTimePlugin, app: App) {
		this.plugin = plugin;
		this.app = app;
	}

	create() {

		this.plugin.addCommand({
			id: 'open-leaderboard',
			name: 'Open leaderboard',
			callback: () => {
				new LeaderboardModal(this.plugin, this.app).open();
			}
		});

	}
}
