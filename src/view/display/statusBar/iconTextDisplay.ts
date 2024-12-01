import {StatusBarDisplay} from "./statusBarDisplay";
import {setIcon} from "obsidian";
export class IconTextDisplay implements StatusBarDisplay {

	render(container: HTMLElement, text: string, icon?: string): void {

		container.empty();

		if (icon) {
			setIcon(container, icon);
		}

		container.createEl("span", {text: text, cls: 'reading-time-text'});
	}
}
