import { App, Modal, normalizePath, Notice } from "obsidian";
import FocusTimePlugin from "../../../main";
import { createRoot, Root } from "react-dom/client";
import { DashboardRoot } from "../../components/DashboardRoot";
import * as React from "react";
import I18n from "../../../language/i18n";

export class DashboardModal extends Modal {
	private readonly plugin: FocusTimePlugin;
	private root: Root | null = null;
	private languageUnsubscribe: (() => void) | null = null;

	constructor(plugin: FocusTimePlugin, app: App) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl, modalEl} = this;
		contentEl.empty();

		modalEl.style.width = '90vw';
		modalEl.style.maxWidth = '1000px';
		modalEl.style.height = '85vh';
		modalEl.style.maxHeight = '800px';

		if (!this.root) {
			this.root = createRoot(contentEl);
		}
		this.renderRoot();

		this.languageUnsubscribe = I18n.getInstance().onChange(() => this.renderRoot());
	}

	onClose() {
		const {contentEl} = this;
		if (this.languageUnsubscribe) {
			this.languageUnsubscribe();
			this.languageUnsubscribe = null;
		}
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		contentEl.empty();
	}

	private renderRoot() {
		if (!this.root) {
			return;
		}
		const onSelect = (filePath: string) => {
			this.openFileInWorkspace(filePath);
			this.close();
		};
		this.root.render(React.createElement(DashboardRoot, { plugin: this.plugin, onSelect }));
	}

	private openFileInWorkspace(filePath: string) {
		const file = this.app.vault.getFileByPath(normalizePath(filePath));
		if (!file) {
			new Notice(I18n.t("common.fileNotFound"));
			return;
		}
		this.app.workspace.getLeaf().openFile(file).finally();
	}
}
