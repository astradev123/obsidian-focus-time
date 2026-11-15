import {App} from "obsidian";
import FocusTimePlugin from "../../../main";
import I18n from "../../../language/i18n";
import {openDashboard} from "../../dashboard/FocusDashboardView";

export class RibbonFactory {
	public static createLeaderboardRibbon(plugin: FocusTimePlugin, app: App) {
		plugin.addRibbonIcon('book-open-text', I18n.t('command.openDashboard'), (evt: MouseEvent) => {
			void openDashboard(plugin);
		});
	}

}
