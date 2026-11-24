import { moment } from "obsidian";
import en from "./locale/en.json";
import zh from "./locale/zh.json";
import zhTW from "./locale/zh-TW.json";
import ja from "./locale/ja.json";
import ko from "./locale/ko.json";
import {
	buildLocaleChain,
	FlatTranslations,
	flattenTranslations,
	interpolate,
	normalizeLocaleTag,
	resolveAvailableLocale,
	resolvePluralKey
} from "./i18nCore";

const rawTranslations: Record<string, unknown> = { en, zh, "zh-TW": zhTW, ja, ko };

const translations: Record<string, FlatTranslations> = {};
for (const locale of Object.keys(rawTranslations)) {
	translations[locale] = flattenTranslations(rawTranslations[locale] as never);
}

const AVAILABLE_LOCALES = Object.keys(translations);

type LanguageChangeListener = () => void;

/**
 * Lightweight i18n service.
 *
 * - Lookup supports dot-separated namespaced keys.
 * - Missing keys fall back to English, then to the key itself.
 * - Language changes notify subscribers so open views can re-render.
 */
class I18n {
	private static instance: I18n | null = null;

	private language = "en";
	private readonly listeners = new Set<LanguageChangeListener>();
	private readonly warnedKeys = new Set<string>();

	public static getInstance(): I18n {
		if (!I18n.instance) {
			I18n.instance = new I18n();
		}
		return I18n.instance;
	}

	/**
	 * Detect the Obsidian UI language. Obsidian follows the system language by default.
	 * Keep the full tag (e.g. `zh-TW`, `pt-BR`) so region-specific locales can be added later.
	 */
	public static autoDetectLanguage(): string {
		try {
			return normalizeLocaleTag(moment.locale() || "en");
		} catch {
			return "en";
		}
	}

	public setLanguage(languageTag: string): void {
		const resolved = resolveAvailableLocale(languageTag, AVAILABLE_LOCALES);
		if (resolved !== this.language) {
			this.language = resolved;
			this.emitChange();
		}
	}

	public getLanguage(): string {
		return this.language;
	}

	public getAvailableLanguages(): string[] {
		return [...AVAILABLE_LOCALES];
	}

	public onChange(listener: LanguageChangeListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	public t(key: string, params: Record<string, string | number> = {}): string {
		const template = this.lookup(key);
		if (template === undefined) {
			this.warnMissingKey(key);
			return key;
		}
		return interpolate(template, params);
	}

	public plural(baseKey: string, count: number, params: Record<string, string | number> = {}): string {
		const key = resolvePluralKey(
			baseKey,
			count,
			(candidate) => this.lookup(candidate) !== undefined,
			this.language
		);
		return this.t(key, { ...params, count });
	}

	public static t(key: string, params: Record<string, string | number> = {}): string {
		return I18n.getInstance().t(key, params);
	}

	public static plural(baseKey: string, count: number, params: Record<string, string | number> = {}): string {
		return I18n.getInstance().plural(baseKey, count, params);
	}

	private lookup(key: string): string | undefined {
		const chain = [this.language, ...buildLocaleChain(this.language)];
		const visited = new Set<string>();

		for (const locale of chain) {
			if (visited.has(locale)) {
				continue;
			}
			visited.add(locale);
			const table = translations[locale];
			if (!table) {
				continue;
			}
			const value = table[key];
			if (typeof value === "string" && value.length > 0) {
				return value;
			}
		}

		const english = translations["en"];
		const fallback = english ? english[key] : undefined;
		return typeof fallback === "string" && fallback.length > 0 ? fallback : undefined;
	}

	private emitChange(): void {
		for (const listener of Array.from(this.listeners)) {
			try {
				listener();
			} catch (error) {
				console.error("[focus-time] Language change listener failed", error);
			}
		}
	}

	private warnMissingKey(key: string): void {
		if (this.warnedKeys.has(key)) {
			return;
		}
		this.warnedKeys.add(key);
		const isDev = typeof process !== "undefined" && !!process.env && process.env.NODE_ENV !== "production";
		if (isDev && typeof console !== "undefined") {
			console.warn(`[focus-time] Missing translation: ${key}`);
		}
	}
}

export default I18n;
