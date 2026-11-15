import {App} from 'obsidian';
import {DashboardModal} from "../view/display/modal/dashboardModal";
import FocusTimePlugin from "../main";
import I18n from "../language/i18n";
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
			name: I18n.t('command.openDashboard'),
			callback: () => {
				new DashboardModal(this.plugin, this.app).open();
			}
		});

		this.plugin.addCommand({
			id: 'toggle-focus-tracking',
			name: I18n.t('command.toggleTracking'),
			callback: () => {
				this.plugin.toggleFocusTracking();
			}
		});

	}
}
