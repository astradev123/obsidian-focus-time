import { IdleMode, MAX_IDLE_MINUTES, MIN_IDLE_MINUTES, resolveIdleMs } from "./tracking/trackingMath";
import { PluginDataManager } from "./pluginDataManager";

export interface FocusTimeSettings {
	strictMode: boolean;
	idleMode: IdleMode;
	idleMinutes: number;
	/**
	 * `auto` follows Obsidian's UI language, otherwise a locale tag such as `en` or `zh`.
	 */
	language: string;
}

export const DEFAULT_SETTINGS: FocusTimeSettings = {
	strictMode: true,
	idleMode: "fixed",
	idleMinutes: 5,
	language: "auto"
};

export class SettingsStore {
	private settings: FocusTimeSettings = { ...DEFAULT_SETTINGS };

	constructor(private readonly dataManager: PluginDataManager) {}

	public async load(): Promise<void> {
		const stored = this.dataManager.get("settings");
		this.settings = SettingsStore.normalize(stored && typeof stored === "object" ? stored : {});
	}

	public get(): FocusTimeSettings {
		return { ...this.settings };
	}

	public getIdleMs(): number {
		return resolveIdleMs(this.settings.idleMode, this.settings.idleMinutes);
	}

	public async update(patch: Partial<FocusTimeSettings>): Promise<void> {
		const next = SettingsStore.normalize({ ...this.settings, ...patch });
		this.settings = next;

		for (const key of Object.keys(patch) as Array<keyof FocusTimeSettings>) {
			await this.dataManager.put("settings", key, next[key], { immediate: true });
		}
	}

	private static normalize(input: Partial<FocusTimeSettings>): FocusTimeSettings {
		const idleMode: IdleMode = input.idleMode === "off" || input.idleMode === "custom" ? input.idleMode : "fixed";
		const rawMinutes = Number(input.idleMinutes);
		const idleMinutes = Number.isFinite(rawMinutes)
			? Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, Math.round(rawMinutes)))
			: DEFAULT_SETTINGS.idleMinutes;

		return {
			strictMode: typeof input.strictMode === "boolean" ? input.strictMode : DEFAULT_SETTINGS.strictMode,
			idleMode,
			idleMinutes,
			language: typeof input.language === "string" && input.language.length > 0 ? input.language : DEFAULT_SETTINGS.language
		};
	}
}
