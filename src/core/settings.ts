import { IdleMode, MAX_IDLE_MINUTES, MIN_IDLE_MINUTES, resolveIdleMs } from "./tracking/trackingMath";
import { PluginDataManager } from "./pluginDataManager";

export interface FocusTimeSettings {
	strictMode: boolean;
	idleMode: IdleMode;
	idleMinutes: number;
	readingIdleMinutes: number;
	dailyGoalMinutes: number;
	/**
	 * `auto` follows Obsidian's UI language, otherwise a locale tag such as `en` or `zh`.
	 */
	language: string;
}

export const DEFAULT_SETTINGS: FocusTimeSettings = {
	strictMode: true,
	idleMode: "fixed",
	idleMinutes: 5,
	readingIdleMinutes: 10,
	dailyGoalMinutes: 60,
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

	public getIdleMs(reading = false): number {
		return resolveIdleMs(this.settings.idleMode, this.settings.idleMinutes, this.settings.readingIdleMinutes, reading);
	}

	public getGoalMs(): number {
		return this.settings.dailyGoalMinutes * 60 * 1000;
	}

	public async update(patch: Partial<FocusTimeSettings>): Promise<void> {
		const next = SettingsStore.normalize({ ...this.settings, ...patch });
		this.settings = next;

		for (const key of Object.keys(patch) as Array<keyof FocusTimeSettings>) {
			await this.dataManager.put("settings", key, next[key], { immediate: true });
		}
	}

	private static normalize(input: Partial<FocusTimeSettings>): FocusTimeSettings {
		const idleMode: IdleMode = input.idleMode === "off" || input.idleMode === "custom" || input.idleMode === "perMode"
			? input.idleMode
			: "fixed";
		const clampMinutes = (value: unknown, fallback: number) => {
			const numeric = Number(value);
			return Number.isFinite(numeric)
				? Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, Math.round(numeric)))
				: fallback;
		};
		const goal = Number(input.dailyGoalMinutes);

		return {
			strictMode: typeof input.strictMode === "boolean" ? input.strictMode : DEFAULT_SETTINGS.strictMode,
			idleMode,
			idleMinutes: clampMinutes(input.idleMinutes, DEFAULT_SETTINGS.idleMinutes),
			readingIdleMinutes: clampMinutes(input.readingIdleMinutes, DEFAULT_SETTINGS.readingIdleMinutes),
			dailyGoalMinutes: Number.isFinite(goal) ? Math.min(720, Math.max(15, Math.round(goal))) : DEFAULT_SETTINGS.dailyGoalMinutes,
			language: typeof input.language === "string" && input.language.length > 0 ? input.language : DEFAULT_SETTINGS.language
		};
	}
}
