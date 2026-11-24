import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DashboardRoot } from "../../src/view/dashboard/DashboardRoot";
import I18n from "../../src/language/i18n";
import { Period } from "../../src/analytics/period";
import FocusTimePlugin from "../../src/main";
import { buildDemoFixture } from "./fixture";

const root = process.env.FT_ROOT ?? process.cwd();
const outDir = join(root, "scripts/screenshots/.out");
const styles = readFileSync(join(root, "styles.css"), "utf8");

const LIGHT = `
:root {
	--background-primary: #ffffff;
	--background-primary-alt: #fafafa;
	--background-secondary: #f6f6f7;
	--background-secondary-alt: #e9eaec;
	--background-modifier-border: #e4e5e8;
	--background-modifier-hover: rgba(15, 20, 30, 0.055);
	--background-modifier-box-shadow: rgba(15, 20, 30, 0.12);
	--text-normal: #2e3338;
	--text-muted: #767c85;
	--text-faint: #9aa0a8;
	--text-accent: #7c5cf6;
	--interactive-accent: #7c5cf6;
	--interactive-accent-hover: #6b47ec;
	--text-on-accent: #ffffff;
	--text-success: #15803d;
	--text-warning: #b45309;
	--text-error: #dc2626;
	--color-green: #16a34a;
	--page-background: #eceef2;
}
`;

const DARK = `
:root {
	--background-primary: #1e1e1e;
	--background-primary-alt: #242424;
	--background-secondary: #262626;
	--background-secondary-alt: #303030;
	--background-modifier-border: #363636;
	--background-modifier-hover: rgba(255, 255, 255, 0.06);
	--background-modifier-box-shadow: rgba(0, 0, 0, 0.55);
	--text-normal: #dadada;
	--text-muted: #9b9b9b;
	--text-faint: #7a7a7a;
	--text-accent: #a68bff;
	--interactive-accent: #7c5cf6;
	--interactive-accent-hover: #8f72ff;
	--text-on-accent: #ffffff;
	--text-success: #4ade80;
	--text-warning: #fbbf24;
	--text-error: #f87171;
	--color-green: #22c55e;
	--page-background: #141414;
}
`;

const SHELL = `
	* { box-sizing: border-box; }
	html, body { margin: 0; height: 100%; }
	body {
		background: var(--page-background);
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
		-webkit-font-smoothing: antialiased;
		text-rendering: optimizeLegibility;
	}
	.stage {
		height: 100%;
		padding: 26px;
		display: flex;
	}
	.window {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		border: 1px solid var(--background-modifier-border);
		border-radius: 14px;
		background: var(--background-primary);
		box-shadow: 0 20px 48px var(--background-modifier-box-shadow);
		overflow: hidden;
	}
	.window > .ft-dashboard { flex: 1; min-width: 0; height: 100%; }
	.stage.is-mobile { padding: 0; }
	.stage.is-mobile .window { border: none; border-radius: 0; box-shadow: none; }
`;

interface Page {
	name: string;
	tab: "overview" | "trends" | "notes" | "categories";
	period: Period;
	theme: "light" | "dark";
	width: number;
	height: number;
	fit?: boolean;
}

const PAGES: Page[] = [
	{name: "dashboard-overview", tab: "overview", period: "month", theme: "light", width: 1280, height: 900, fit: true},
	{name: "dashboard-trends", tab: "trends", period: "total", theme: "light", width: 1280, height: 900, fit: true},
	{name: "dashboard-notes", tab: "notes", period: "month", theme: "light", width: 1280, height: 940, fit: true},
	{name: "dashboard-categories", tab: "categories", period: "total", theme: "dark", width: 1280, height: 800, fit: true},
	{name: "dashboard-mobile", tab: "overview", period: "week", theme: "light", width: 390, height: 844}
];

function buildPlugin(): FocusTimePlugin {
	const fixture = buildDemoFixture();

	const plugin = {
		storage: {
			index: fixture.index,
			getPath: (noteId: string) => fixture.paths.get(noteId),
			onChange: () => () => undefined
		},
		settingsManager: {
			get: () => fixture.settings,
			getGoalMs: () => fixture.settings.dailyGoalMinutes * 60 * 1000
		},
		app: {
			vault: {getFileByPath: () => null},
			workspace: {getLeaf: () => ({openFile: () => undefined})}
		}
	};

	return plugin as unknown as FocusTimePlugin;
}

function pageHtml(page: Page, body: string): string {
	return `<!doctype html>
<html class="theme-${page.theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${page.theme === "dark" ? DARK : LIGHT}</style>
<style>${SHELL}</style>
<style>${styles}</style>
</head>
<body>
<div class="stage ${page.width < 500 ? "is-mobile" : ""}">
	<div class="window">${body}</div>
</div>
</body>
</html>`;
}

function main(): void {
	I18n.getInstance().setLanguage("en");
	const plugin = buildPlugin();

	mkdirSync(outDir, {recursive: true});

	const manifest = PAGES.map((page) => {
		const body = renderToStaticMarkup(
			React.createElement(DashboardRoot, {
				plugin,
				initialTab: page.tab,
				initialPeriod: page.period
			})
		);
		const file = join(outDir, `${page.name}.html`);
		writeFileSync(file, pageHtml(page, body), "utf8");
		console.log(`rendered ${page.name} (${Math.round(body.length / 1024)} kB)`);
		return {name: page.name, file, width: page.width, height: page.height, fit: page.fit};
	});

	writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

main();
