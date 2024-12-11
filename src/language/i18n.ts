// @ts-ignore
import en from './locale/en.json';
// @ts-ignore
import zh from './locale/zh.json';
import {moment} from "obsidian";

type Translations = { [key: string]: string };

class I18n {

	private static instance: I18n;
	private language: string;
	private translations: { [key: string]: Translations } = {
		en: en,
		zh: zh
	};

	private constructor(defaultLanguage = 'en') {
		this.language = defaultLanguage;
	}

	public static getInstance(defaultLanguage = 'en'): I18n {
		if (!I18n.instance) {
			I18n.instance = new I18n(defaultLanguage);
		}
		return I18n.instance;
	}

	public setLanguage(language: string) {
		this.language = language;
	}

	public t(key: string, params: { [key: string]: string | number } = {}): string {
		let translation = this.translations[this.language] ? this.translations[this.language][key] : this.translations['en'][key];
		Object.keys(params).forEach((param) => {
			translation = translation.replace(`{${param}}`, String(params[param]));
		});
		return translation;
	}

	public static t(key: string, params: { [key: string]: string | number } = {}): string {
		return I18n.getInstance().t(key, params);
	}

	public static autoDetectLanguage(defaultLanguage: string = "en") {
		return moment.locale().split('-')[0] || defaultLanguage;
	}
}

export default I18n;
