import {App} from 'obsidian';
import {DashboardModal} from "../view/display/modal/dashboardModal";
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
			name: 'Open dashboard',
			callback: () => {
				new DashboardModal(this.plugin, this.app).open();
			}
		});

	}
}
