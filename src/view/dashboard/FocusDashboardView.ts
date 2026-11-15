import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import * as React from "react";
import FocusTimePlugin from "../../main";
import { DashboardRoot } from "./DashboardRoot";
import I18n from "../../language/i18n";

export const FOCUS_DASHBOARD_VIEW = "focus-time-dashboard";

export class FocusDashboardView extends ItemView {
	private root: Root | null = null;
	private unsubscribe: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: FocusTimePlugin) {
		super(leaf);
	}

	getViewType(): string {
		return FOCUS_DASHBOARD_VIEW;
	}

	getDisplayText(): string {
		return I18n.t("app.title");
	}

	getIcon(): string {
		return "book-open-text";
	}

	async onOpen(): Promise<void> {
		this.contentEl.classList.add("ft-dashboard-host");
		this.root = createRoot(this.contentEl);
		this.render();
		this.unsubscribe = I18n.getInstance().onChange(() => this.render());
	}

	async onClose(): Promise<void> {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}

	private render(): void {
		this.root?.render(React.createElement(DashboardRoot, {plugin: this.plugin}));
	}
}

export async function openDashboard(plugin: FocusTimePlugin): Promise<void> {
	const existing = plugin.app.workspace.getLeavesOfType(FOCUS_DASHBOARD_VIEW);
	if (existing.length > 0) {
		await plugin.app.workspace.revealLeaf(existing[0]);
		return;
	}

	const leaf = plugin.app.workspace.getLeaf("tab");
	await leaf.setViewState({type: FOCUS_DASHBOARD_VIEW, active: true});
}
