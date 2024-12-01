import {App, PluginSettingTab, Setting} from "obsidian";
import FocusTimePlugin from "../main";
import I18n from "../language/i18n";

export class FocusTimeSettingTab extends PluginSettingTab {
	plugin: FocusTimePlugin;

	constructor(app: App, plugin: FocusTimePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		this.addLanguageSetting(containerEl);
		this.addStrictModeSetting(containerEl);

	}

	private addLanguageSetting(containerEl: HTMLElement) {
		const languageSetting = this.plugin.dataManager.get('settings', 'language');
		new Setting(containerEl)
			.setName(I18n.t('language'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('en', "English")
					.addOption('zh', "简体中文")
					.setValue(languageSetting ? languageSetting : I18n.autoDetectLanguage())
					.onChange((value) => {
						this.plugin.dataManager.put('settings', 'language', value).finally();
						// Update language immediately
						I18n.getInstance().setLanguage(value);
					})
			)
	}

	private addStrictModeSetting(containerEl: HTMLElement) {
		const strictModeSetting = this.plugin.dataManager.get('settings', 'strictMode');
		new Setting(containerEl)
			.setName(I18n.t('strictMode'))
			.setDesc(I18n.t('strictModeDesc'))
			.addToggle((toggle) =>
				toggle
					.setValue(strictModeSetting !== undefined ? strictModeSetting : true)
					.onChange((value) => {
						this.plugin.dataManager.put('settings', 'strictMode', value).finally();
					})
			)
	}

}
