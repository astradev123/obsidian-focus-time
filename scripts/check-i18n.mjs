#!/usr/bin/env node
/**
 * Validate locale files and catch hard-coded UI strings.
 *
 * Checks:
 * 1. Every locale has the same keys as English.
 * 2. Placeholders match across locales.
 * 3. No static `I18n.t("...")` key is missing.
 * 4. No CJK literals in source files (comments excluded).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const localeDir = path.join(root, "src/language/locale");
const sourceDir = path.join(root, "src");

function flatten(tree, prefix = "", out = {}) {
	for (const key of Object.keys(tree)) {
		const value = tree[key];
		const next = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string") {
			out[next] = value;
		} else if (value && typeof value === "object") {
			flatten(value, next, out);
		}
	}
	return out;
}

function placeholders(template) {
	const result = [];
	const regex = /\{(\w+)\}/g;
	let match;
	while ((match = regex.exec(template)) !== null) {
		result.push(match[1]);
	}
	return result.sort();
}

function walk(dir, files = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "locale") {
				continue;
			}
			walk(full, files);
		} else if (/\.(ts|tsx)$/.test(entry.name)) {
			files.push(full);
		}
	}
	return files;
}

const errors = [];
const localeFiles = fs.readdirSync(localeDir).filter((file) => file.endsWith(".json"));
const locales = {};

for (const file of localeFiles) {
	const name = path.basename(file, ".json");
	locales[name] = flatten(JSON.parse(fs.readFileSync(path.join(localeDir, file), "utf8")));
}

const reference = locales.en;
if (!reference) {
	errors.push("locale/en.json is required");
}

for (const [name, table] of Object.entries(locales)) {
	if (name === "en") {
		continue;
	}
	for (const key of Object.keys(reference)) {
		if (table[key] === undefined) {
			errors.push(`${name}: missing key "${key}"`);
		}
	}
	for (const key of Object.keys(table)) {
		if (reference[key] === undefined) {
			errors.push(`${name}: extra key "${key}"`);
			continue;
		}
		const expected = placeholders(reference[key]).join(",");
		const actual = placeholders(table[key]).join(",");
		if (expected !== actual) {
			errors.push(`${name}: placeholder mismatch for "${key}" (${expected} vs ${actual})`);
		}
		if (table[key].trim().length === 0) {
			errors.push(`${name}: empty value for "${key}"`);
		}
	}
}

const cjkPattern = /[\u3400-\u9fff]/;
const staticKeyPattern = /I18n\.t\(\s*['"]([^'"]+)['"]/g;

for (const file of walk(sourceDir)) {
	const relative = path.relative(root, file);
	const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

	lines.forEach((line, index) => {
		const trimmed = line.trim();
		if (
			cjkPattern.test(line) &&
			!trimmed.startsWith("//") &&
			!trimmed.startsWith("*") &&
			!trimmed.startsWith("/*") &&
			!line.includes("i18n-ignore")
		) {
			errors.push(`${relative}:${index + 1}: hard-coded CJK text: ${trimmed}`);
		}

		let match;
		while ((match = staticKeyPattern.exec(line)) !== null) {
			const key = match[1];
			if (!key.includes("${") && reference[key] === undefined) {
				errors.push(`${relative}:${index + 1}: unknown i18n key "${key}"`);
			}
		}
		staticKeyPattern.lastIndex = 0;
	});
}

if (errors.length > 0) {
	console.error(`i18n check failed with ${errors.length} issue(s):`);
	for (const error of errors) {
		console.error(`  - ${error}`);
	}
	process.exit(1);
}

console.log(`i18n check passed (${Object.keys(reference).length} keys, ${localeFiles.length} locales)`);
