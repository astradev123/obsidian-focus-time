#!/usr/bin/env node
/**
 * Renders the dashboard from demo data and screenshots it with headless Chrome.
 *
 *   npm run shots
 *
 * Chrome is picked up from CHROME_PATH, or the usual macOS location. Set
 * SCALE=1 for smaller images.
 *
 * Chrome refuses to open windows narrower than ~500px, so the pages are driven
 * over the DevTools protocol instead: that gives us exact viewports and lets
 * each desktop capture size itself to its content.
 */
import { build } from "esbuild";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const outDir = join(here, ".out");
const assetDir = join(root, "asset");
const bundlePath = join(outDir, "render.mjs");

const CHROME_CANDIDATES = [
	process.env.CHROME_PATH,
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium"
].filter(Boolean);

const scale = Number(process.env.SCALE ?? "2");
const OBSOLETE = ["dashboard.png", "leaderboard.png", "ribbon.png", "statusbar.png"];
const MIN_HEIGHT = 480;
const MAX_HEIGHT = 1200;

function cleanupProfile(dir) {
	try {
		rmSync(dir, {recursive: true, force: true, maxRetries: 3});
	} catch {
		// Chrome can still hold files for a moment; a leftover temp dir is harmless.
	}
}

function findChrome() {
	for (const candidate of CHROME_CANDIDATES) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	console.error("Chrome not found. Set CHROME_PATH to the binary and run again.");
	process.exit(1);
}

async function bundle() {
	mkdirSync(outDir, {recursive: true});
	await build({
		entryPoints: [join(here, "render.tsx")],
		outfile: bundlePath,
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node18",
		jsx: "automatic",
		external: ["react", "react-dom"],
		plugins: [{
			name: "obsidian-stub",
			setup(build) {
				build.onResolve({filter: /^obsidian$/}, () => ({path: join(here, "obsidianStub.ts")}));
			}
		}]
	});
}

function render() {
	const result = spawnSync(process.execPath, [bundlePath], {stdio: "inherit", env: {...process.env, FT_ROOT: root}});
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

class Session {
	constructor(socket) {
		this.socket = socket;
		this.counter = 0;
		this.pending = new Map();
		this.waiters = new Map();
		socket.addEventListener("message", (event) => this.handle(event.data));
	}

	static connect(url) {
		return new Promise((resolveSession, reject) => {
			const socket = new WebSocket(url);
			socket.addEventListener("open", () => resolveSession(new Session(socket)));
			socket.addEventListener("error", () => reject(new Error(`cannot connect to ${url}`)));
		});
	}

	handle(raw) {
		const message = JSON.parse(raw);
		if (message.id !== undefined) {
			const pending = this.pending.get(message.id);
			if (pending) {
				this.pending.delete(message.id);
				message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
			}
			return;
		}
		const listeners = this.waiters.get(message.method);
		if (listeners) {
			this.waiters.delete(message.method);
			for (const listener of listeners) {
				listener(message.params);
			}
		}
	}

	send(method, params = {}) {
		const id = ++this.counter;
		this.socket.send(JSON.stringify({id, method, params}));
		return new Promise((resolveSend, reject) => {
			this.pending.set(id, {resolve: resolveSend, reject});
		});
	}

	once(method) {
		return new Promise((resolveEvent) => {
			const listeners = this.waiters.get(method) ?? [];
			listeners.push(resolveEvent);
			this.waiters.set(method, listeners);
		});
	}

	close() {
		this.socket.close();
	}
}

async function waitForEndpoint(proc) {
	return new Promise((resolveEndpoint, reject) => {
		let buffer = "";
		const timer = setTimeout(() => reject(new Error("Chrome did not report a debugging endpoint")), 20000);
		proc.stderr.on("data", (chunk) => {
			buffer += chunk.toString();
			const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
			if (match) {
				clearTimeout(timer);
				resolveEndpoint(match[1]);
			}
		});
		proc.on("exit", (code) => {
			clearTimeout(timer);
			reject(new Error(`Chrome exited early (${code})`));
		});
	});
}

async function httpJson(base, path, method = "GET") {
	const response = await fetch(`${base}${path}`, {method});
	return response.json();
}

async function capture(browserUrl, page) {
	const base = browserUrl.replace(/^ws:\/\//, "http://").replace(/\/devtools\/browser\/.*$/, "");
	const target = await httpJson(base, "/json/new?about:blank", "PUT");
	const session = await Session.connect(target.webSocketDebuggerUrl);
	const url = `file://${page.file}`;
	const mobile = page.width < 600;

	try {
		await session.send("Page.enable");
		await session.send("Emulation.setDeviceMetricsOverride", {
			width: page.width,
			height: page.height,
			deviceScaleFactor: scale,
			mobile
		});
		const loaded = session.once("Page.loadEventFired");
		await session.send("Page.navigate", {url});
		await loaded;
		await new Promise((done) => setTimeout(done, 350));

		if (process.env.DEBUG) {
			const probe = await session.send("Runtime.evaluate", {
				expression: `JSON.stringify({
					w: innerWidth,
					h: innerHeight,
					scroll: document.querySelector('.ft-main').scrollHeight,
					client: document.querySelector('.ft-main').clientHeight,
					inner: Math.round(document.querySelector('.ft-main-inner').getBoundingClientRect().height),
					lastCard: Math.round([...document.querySelectorAll('.ft-card')].pop().getBoundingClientRect().bottom)
				})`,
				returnByValue: true
			});
			console.log(`    ${page.name} ${probe.result.value}`);
		}

		if (page.fit) {
			let height = page.height;
			for (let attempt = 0; attempt < 3; attempt++) {
				const measured = await session.send("Runtime.evaluate", {
					expression: `(() => {
						const main = document.querySelector('.ft-main');
						const inner = document.querySelector('.ft-main-inner');
						const cards = document.querySelectorAll('.ft-card');
						const last = cards.length ? cards[cards.length - 1].getBoundingClientRect().bottom : 0;
						const innerHeight = inner.getBoundingClientRect().height;
						const overflow = main.scrollHeight > main.clientHeight ? main.scrollHeight : 0;
						return {inner: Math.ceil(innerHeight), last: Math.ceil(last), overflow};
					})()`,
					returnByValue: true
				});
				const metrics = measured.result.value;
				const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, metrics.inner, metrics.last + 40, metrics.overflow));
				if (process.env.DEBUG) {
					console.log(`    ${page.name} content ${JSON.stringify(metrics)} -> ${next}`);
				}
				if (Math.abs(next - height) < 2) {
					break;
				}
				height = next;
				await session.send("Emulation.setDeviceMetricsOverride", {
					width: page.width,
					height,
					deviceScaleFactor: scale,
					mobile
				});
				await new Promise((done) => setTimeout(done, 200));
			}
			page.height = height;
		}

		const shot = await session.send("Page.captureScreenshot", {format: "png", fromSurface: true});
		const file = join(assetDir, `${page.name}.png`);
		writeFileSync(file, Buffer.from(shot.data, "base64"));
		const size = Math.round(statSync(file).size / 1024);
		console.log(`  ${page.name}.png  ${page.width}x${page.height} @${scale}x  ${size} kB`);
	} finally {
		session.close();
		await fetch(`${base}/json/close/${target.id}`).catch(() => undefined);
	}
}

async function main() {
	const chrome = findChrome();
	console.log("bundling renderer");
	await bundle();

	console.log("rendering pages");
	render();

	mkdirSync(assetDir, {recursive: true});
	const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));

	const profile = mkdtempSync(join(tmpdir(), "focus-time-shots-"));

	const proc = spawn(chrome, [
		"--headless=new",
		"--no-sandbox",
		"--disable-dev-shm-usage",
		"--disable-gpu",
		"--hide-scrollbars",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-extensions",
		"--remote-debugging-port=0",
		`--user-data-dir=${profile}`,
		"about:blank"
	], {stdio: ["ignore", "ignore", "pipe"]});

	try {
		const browserUrl = await waitForEndpoint(proc);
		console.log("capturing");
		for (const page of manifest) {
			try {
				await capture(browserUrl, page);
			} catch (error) {
				console.error(`  ${page.name} failed: ${error.message}`);
				throw error;
			}
		}
	} finally {
		proc.kill();
		cleanupProfile(profile);
	}

	for (const name of OBSOLETE) {
		const path = join(assetDir, name);
		if (existsSync(path)) {
			unlinkSync(path);
			console.log(`  removed stale ${name}`);
		}
	}

	console.log("done");
}

await main();
