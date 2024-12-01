
import { StatusBarDisplay } from "./statusBarDisplay";

export class TextDisplay implements StatusBarDisplay {
	render(container: HTMLElement, text: string): void {
		container.textContent = text;
	}
}
