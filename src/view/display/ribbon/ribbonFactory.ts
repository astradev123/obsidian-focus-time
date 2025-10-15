import {App} from "obsidian";
import {LeaderboardModal} from "../modal/leaderboardModal";
import FocusTimePlugin from "../../../main";
import I18n from "../../../language/i18n";

export class RibbonFactory {
	public static createLeaderboardRibbon(plugin: FocusTimePlugin, app: App) {
		plugin.addRibbonIcon('book-open-text', I18n.t('openLeaderboardModal'), (evt: MouseEvent) => {
			new LeaderboardModal(plugin, app).open();
		});
	}

}
