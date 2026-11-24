import { beforeEach, describe, expect, it } from "vitest";
import {
	buildLocaleChain,
	flattenTranslations,
	interpolate,
	normalizeLocaleTag,
	placeholders,
	resolveAvailableLocale,
	resolvePluralKey
} from "../src/language/i18nCore";
import I18n from "../src/language/i18n";
import { TimeUtils } from "../src/util/timeUtils";

describe("i18n core", () => {
	it("flattens nested keys", () => {
		const flat = flattenTranslations({ dashboard: { kpi: { focusTime: "Focus time" } }, app: { title: "Focus" } });
		expect(flat["dashboard.kpi.focusTime"]).toBe("Focus time");
		expect(flat["app.title"]).toBe("Focus");
	});

	it("normalizes locale tags", () => {
		expect(normalizeLocaleTag("zh_CN")).toBe("zh-CN");
		expect(normalizeLocaleTag("")).toBe("en");
	});

	it("builds a fallback chain", () => {
		expect(buildLocaleChain("zh-Hant-TW")).toEqual(["zh-hant-tw", "zh-hant", "zh", "en"]);
		expect(buildLocaleChain("en")).toEqual(["en"]);
	});

	it("resolves the closest available locale", () => {
		expect(resolveAvailableLocale("zh-CN", ["en", "zh"])).toBe("zh");
		expect(resolveAvailableLocale("en-US", ["en", "zh"])).toBe("en");
		expect(resolveAvailableLocale("fr-FR", ["en", "zh"])).toBe("en");
	});

	it("interpolates named placeholders and leaves unknown ones", () => {
		expect(interpolate("{hour}h {minute}m", { hour: 2, minute: 14 })).toBe("2h 14m");
		expect(interpolate("{unknown}", {})).toBe("{unknown}");
	});

	it("extracts placeholders", () => {
		expect(placeholders("{hour}h {minute}m")).toEqual(["hour", "minute"]);
	});

	it("falls back to the other plural form", () => {
		const hasKey = (key: string) => key === "sessions_other";
		expect(resolvePluralKey("sessions", 1, hasKey, "en")).toBe("sessions_other");
	});
});

describe("I18n", () => {
	beforeEach(() => {
		I18n.getInstance().setLanguage("en");
	});

	it("loads the requested locale", () => {
		I18n.getInstance().setLanguage("zh");
		expect(I18n.t("app.title")).toBe("专注时间仪表盘");
		expect(I18n.t("status.focusing")).toBe("专注中");
	});

	it("falls back from a region tag to the base language", () => {
		I18n.getInstance().setLanguage("zh-TW");
		expect(I18n.t("app.title")).toBe("專注時間儀表板");
	});

	it("loads the Japanese and Korean locales", () => {
		I18n.getInstance().setLanguage("ja");
		expect(I18n.t("app.title")).toBe("フォーカスタイム");
		I18n.getInstance().setLanguage("ko");
		expect(I18n.t("app.title")).toBe("포커스 타임");
	});

	it("returns the key instead of throwing when a translation is missing", () => {
		expect(I18n.t("missing.translation.key")).toBe("missing.translation.key");
	});

	it("formats durations per locale", () => {
		I18n.getInstance().setLanguage("zh");
		expect(TimeUtils.getFormattedReadingTime(90 * 60 * 1000)).toBe("1小时 30分钟");
		expect(TimeUtils.getFormattedReadingTime(30 * 1000)).toBe("< 1分钟");

		I18n.getInstance().setLanguage("en");
		expect(TimeUtils.getFormattedReadingTime(90 * 60 * 1000)).toBe("1h 30m");
	});
});
