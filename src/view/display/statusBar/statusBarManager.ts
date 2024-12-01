import {StatusBarDisplay} from "./statusBarDisplay";
import {Plugin} from "obsidian";

export class StatusBarManager {

	private plugin: Plugin;

	private readonly statusBar: HTMLElement;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.statusBar = this.plugin.addStatusBarItem();
	}

	/**
	 * Display status bar
	 * @param strategy
	 * @param text
	 * @param icon
	 */
	display(strategy: StatusBarDisplay, text: string, icon?: string) {
		strategy.render(this.statusBar, text, icon);
	}

	/**
	 * Remove status bar
	 */
	remove() {
		this.statusBar.empty();
	}
}
