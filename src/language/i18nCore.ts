export type TranslationTree = {
	[key: string]: string | TranslationTree;
};

export type FlatTranslations = Record<string, string>;

/**
 * Flatten a nested translation tree into dot-separated keys.
 */
export function flattenTranslations(
	tree: TranslationTree,
	prefix = "",
	out: FlatTranslations = {}
): FlatTranslations {
	for (const key of Object.keys(tree)) {
		const value = tree[key];
		const nextKey = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string") {
			out[nextKey] = value;
		} else if (value && typeof value === "object") {
			flattenTranslations(value, nextKey, out);
		}
	}
	return out;
}

/**
 * Normalize a locale tag: `zh_CN` -> `zh-CN`.
 */
export function normalizeLocaleTag(tag: string): string {
	const normalized = (tag || "en").trim().replace(/_/g, "-");
	return normalized.length > 0 ? normalized : "en";
}

/**
 * Build a fallback chain for a locale tag.
 * Example: `zh-Hant-TW` -> [`zh-hant-tw`, `zh-hant`, `zh`, `en`]
 */
export function buildLocaleChain(tag: string): string[] {
	const normalized = normalizeLocaleTag(tag).toLowerCase();
	const parts = normalized.split("-").filter(Boolean);
	const chain: string[] = [normalized];

	if (parts.length >= 3) {
		chain.push(`${parts[0]}-${parts[1]}`);
	}
	if (parts.length >= 2) {
		chain.push(parts[0]);
	}
	if (!chain.includes("en")) {
		chain.push("en");
	}

	return chain.filter((item, index) => chain.indexOf(item) === index);
}

/**
 * Pick the closest available locale for a requested tag.
 */
export function resolveAvailableLocale(tag: string, available: string[]): string {
	const lowerAvailable = available.map((item) => item.toLowerCase());
	const chain = buildLocaleChain(tag);

	for (const candidate of chain) {
		const index = lowerAvailable.indexOf(candidate);
		if (index >= 0) {
			return available[index];
		}
	}
	return "en";
}

/**
 * Replace `{name}` placeholders. Unknown placeholders are left untouched.
 */
export function interpolate(template: string, params: Record<string, string | number> = {}): string {
	return template.replace(/\{(\w+)\}/g, (match, name: string) => {
		const value = params[name];
		return value === undefined || value === null ? match : String(value);
	});
}

/**
 * Resolve a plural key such as `sessions_one` / `sessions_other`.
 * Falls back to `_other` when the category is missing.
 */
export function resolvePluralKey(
	baseKey: string,
	count: number,
	hasKey: (key: string) => boolean,
	locale: string
): string {
	let category = "other";
	try {
		if (typeof Intl !== "undefined" && typeof Intl.PluralRules === "function") {
			category = new Intl.PluralRules(locale).select(count);
		}
	} catch {
		category = count === 1 ? "one" : "other";
	}

	const pluralKey = `${baseKey}_${category}`;
	if (hasKey(pluralKey)) {
		return pluralKey;
	}
	const otherKey = `${baseKey}_other`;
	if (hasKey(otherKey)) {
		return otherKey;
	}
	return baseKey;
}

/**
 * Return the keys of `values` that are missing from `reference`.
 */
export function missingKeys(reference: FlatTranslations, values: FlatTranslations): string[] {
	return Object.keys(reference).filter((key) => values[key] === undefined);
}

/**
 * Return the keys of `values` that are not present in `reference`.
 */
export function extraKeys(reference: FlatTranslations, values: FlatTranslations): string[] {
	return Object.keys(values).filter((key) => reference[key] === undefined);
}

/**
 * Extract `{placeholder}` names from a template.
 */
export function placeholders(template: string): string[] {
	const result: string[] = [];
	const regex = /\{(\w+)\}/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(template)) !== null) {
		result.push(match[1]);
	}
	return result.sort();
}
