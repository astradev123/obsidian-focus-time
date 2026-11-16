import { App, PluginSettingTab, Setting } from "obsidian";
import FocusTimePlugin from "../main";
import I18n from "../language/i18n";
import { IdleMode } from "../core/tracking/trackingMath";

export class FocusTimeSettingTab extends PluginSettingTab {
	plugin: FocusTimePlugin;

	constructor(app: App, plugin: FocusTimePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const {containerEl} = this;
		containerEl.empty();

		this.addLanguageSetting(containerEl);
		this.addStrictModeSetting(containerEl);
		this.addIdleSetting(containerEl);
		this.addGoalSetting(containerEl);
	}

	private addLanguageSetting(containerEl: HTMLElement) {
		const settings = this.plugin.settingsManager.get();
		new Setting(containerEl)
			.setName(I18n.t("settings.language.name"))
			.setDesc(I18n.t("settings.language.desc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("auto", I18n.t("settings.language.auto"))
					.addOption("en", "English")
					.addOption("zh", "简体中文") // i18n-ignore: language endonym
					.addOption("zh-TW", "繁體中文") // i18n-ignore: language endonym
					.addOption("ja", "日本語") // i18n-ignore: language endonym
					.addOption("ko", "한국어") // i18n-ignore: language endonym
					.setValue(settings.language)
					.onChange(async (value) => {
						await this.plugin.settingsManager.update({language: value});
						this.plugin.applyLanguagePreference();
						this.display();
					});
			});
	}

	private addStrictModeSetting(containerEl: HTMLElement) {
		const settings = this.plugin.settingsManager.get();
		new Setting(containerEl)
			.setName(I18n.t("settings.strictMode.name"))
			.setDesc(I18n.t("settings.strictMode.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(settings.strictMode)
					.onChange(async (value) => {
						await this.plugin.settingsManager.update({strictMode: value});
					})
			);
	}

	private addIdleSetting(containerEl: HTMLElement) {
		const settings = this.plugin.settingsManager.get();

		new Setting(containerEl)
			.setName(I18n.t("settings.idle.name"))
			.setDesc(I18n.t("settings.idle.desc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("off", I18n.t("settings.idle.off"))
					.addOption("fixed", I18n.t("settings.idle.fixed"))
					.addOption("custom", I18n.t("settings.idle.custom"))
					.addOption("perMode", I18n.t("settings.idle.perMode"))
					.setValue(settings.idleMode)
					.onChange(async (value) => {
						await this.plugin.settingsManager.update({idleMode: value as IdleMode});
						this.display();
					});
			});

		if (settings.idleMode === "custom" || settings.idleMode === "perMode") {
			new Setting(containerEl)
				.setName(I18n.t("settings.idle.minutes"))
				.addSlider((slider) =>
					slider
						.setLimits(1, 120, 1)
						.setValue(settings.idleMinutes)
						.setDynamicTooltip()
						.onChange(async (value) => {
							await this.plugin.settingsManager.update({idleMinutes: value});
						})
				);
		}

		if (settings.idleMode === "perMode") {
			new Setting(containerEl)
				.setName(I18n.t("settings.idle.readingMinutes"))
				.addSlider((slider) =>
					slider
						.setLimits(1, 120, 1)
						.setValue(settings.readingIdleMinutes)
						.setDynamicTooltip()
						.onChange(async (value) => {
							await this.plugin.settingsManager.update({readingIdleMinutes: value});
						})
				);
		}
	}

	private addGoalSetting(containerEl: HTMLElement) {
		const settings = this.plugin.settingsManager.get();
		new Setting(containerEl)
			.setName(I18n.t("settings.goal.name"))
			.setDesc(I18n.t("settings.goal.desc"))
			.addSlider((slider) =>
				slider
					.setLimits(15, 480, 15)
					.setValue(settings.dailyGoalMinutes)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.plugin.settingsManager.update({dailyGoalMinutes: value});
					})
			);
	}

}
