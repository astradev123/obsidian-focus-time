export interface StatusBarDisplay {

	/**
	 * Render the status display
	 * @param container
	 * @param text
	 * @param icon
	 */
	render(container: HTMLElement, text: string, icon?: string): void;
}
