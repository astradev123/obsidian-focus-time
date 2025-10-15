import {Plugin} from "obsidian";
import * as React from "react";
import {createRoot, Root} from "react-dom/client";
import { StatusBarRoot } from "../../components/StatusBarRoot";

export class StatusBarManager {

	private plugin: Plugin;

    private readonly statusBar: HTMLElement;
    private root: Root | null = null;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.statusBar = this.plugin.addStatusBarItem();
	}

    /**
     * Render status bar with React
     */
    render(text: string, icon?: string) {
        if (!this.root) {
            this.root = createRoot(this.statusBar);
        }
        this.root.render(React.createElement(StatusBarRoot, { text, icon }));
    }

	/**
	 * Remove status bar
	 */
    remove() {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        this.statusBar.empty();
    }
}
