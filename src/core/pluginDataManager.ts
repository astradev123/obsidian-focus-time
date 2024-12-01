import {Plugin} from "obsidian";

export class PluginDataManager {
	private plugin: Plugin;
	private data: Record<string, any> = {};

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	/**
	 * Load all data.
	 * @private
	 */
	public async loadData() {
		const loadedData = await this.plugin.loadData();
		this.data = loadedData || {};
	}

	/**
	 * Save data.
	 * @private
	 */
	private async saveData() {
		await this.plugin.saveData(this.data);
	}

	/**
	 * Put data into specific category.
	 * @param category
	 * @param key
	 * @param value
	 */
	public async put(category: string, key: string, value: any) {
		if (!this.data[category]) {
			this.data[category] = {};
		}
		this.data[category][key] = value;
		await this.saveData();
	}

	/**
	 * Get data from specific category.
	 * @param category
	 * @param key
	 */
	public get(category: string, key: string): any | undefined {
		return this.data[category]?.[key];
	}


	/**
	 * Get all data from specific category.
	 * @param category
	 */
	public getCategory(category: string): Record<string, any> | undefined {
		return this.data[category];
	}

	/**
	 * Delete data from specific category.
	 * @param category
	 * @param key
	 */
	public async delete(category: string, key: string) {
		if (this.data[category]) {
			delete this.data[category][key];
			await this.saveData();
		}
	}

	/**
	 * Delete specific category.
	 * @param category
	 */
	public async deleteCategory(category: string) {
		if (this.data[category]) {
			delete this.data[category];
			await this.saveData();
		}
	}
}
