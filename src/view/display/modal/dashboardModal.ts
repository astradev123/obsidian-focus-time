import {App, Modal, normalizePath, Notice} from "obsidian";
import FocusTimePlugin from "../../../main";
import {createRoot, Root} from "react-dom/client";
import { DashboardRoot } from "../../components/DashboardRoot";
import * as React from "react";

export class DashboardModal extends Modal {
	private readonly plugin: FocusTimePlugin;
    private root: Root | null = null;
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
        const onSelect = (filePath: string) => {
            this.openFileInWorkspace(filePath);
            this.close();
        };
        this.root.render(React.createElement(DashboardRoot, { plugin: this.plugin, onSelect }));
	}

	onClose() {
		const {contentEl} = this;
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        contentEl.empty();
	}

    private openFileInWorkspace(filePath: string) {
        const file = this.app.vault.getFileByPath(normalizePath(filePath));
		if(!file) {
            new Notice("File not found");
			return;
		}
		this.app.workspace.getLeaf().openFile(file).finally();
	}
}

