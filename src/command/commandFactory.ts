import {App, Notice} from 'obsidian';
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

		this.plugin.addCommand({
			id: 'rescan-legacy-data',
			name: I18n.t('command.rescanLegacy'),
			callback: () => {
				void this.plugin.rescanLegacy().then((imported) => {
					new Notice(I18n.t('notice.rescan', {count: imported}));
				});
			}
		});

	}
}
