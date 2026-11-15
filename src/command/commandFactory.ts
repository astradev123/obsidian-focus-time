import {App, Notice} from 'obsidian';
import {openDashboard} from "../view/dashboard/FocusDashboardView";
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
				void openDashboard(this.plugin);
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

		this.plugin.addCommand({
			id: 'export-focus-csv',
			name: I18n.t('command.exportCsv'),
			callback: () => {
				void this.plugin.exportCsv();
			}
		});

		this.plugin.addCommand({
			id: 'export-focus-json',
			name: I18n.t('command.exportJson'),
			callback: () => {
				void this.plugin.exportJson();
			}
		});

		this.plugin.addCommand({
			id: 'export-focus-markdown',
			name: I18n.t('command.exportMarkdown'),
			callback: () => {
				void this.plugin.exportMarkdown();
			}
		});

		this.plugin.addCommand({
			id: 'write-focus-frontmatter',
			name: I18n.t('command.writeFrontmatter'),
			callback: () => {
				void this.plugin.writeFrontmatter();
			}
		});

	}
}
