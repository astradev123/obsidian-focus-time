import {App, normalizePath} from "obsidian";
import {ReadRecord} from "../interface/readRecord";
import {TimeUtils} from "../util/timeUtils";

export class DailyReadDataManager {

	private app: App;
	private readonly dataDir: string;

	constructor(app: App) {
		this.app = app;
		this.dataDir = `${app.vault.configDir}/plugins/focus-time/data`;
		this.mkdir().finally();
	}

	/**
	 * Ensure that the data directory exists
	 */
	private async mkdir() {
		await this.app.vault.adapter.mkdir(normalizePath(this.dataDir));
	}

	/**
	 * Save the daily reading data
	 * @param category Category
	 * @param date Date(Format：YYYY-MM-DD)
	 * @param data Daily reading data
	 */
	public async saveTodayData(category: string, data: ReadRecord) {
		const dateToday = TimeUtils.getDateToday();
		const filePath = this.getFilePath(dateToday);
		const existingData = await this.loadTodayData();

		if (!existingData[category]) {
			existingData[category] = {};
		}

		existingData[category][`${data.fileId}`] = data;

		const jsonContent = JSON.stringify(existingData, null, 2);
		await this.saveFile(filePath, jsonContent);
	}

	/**
	 * Load today's reading data
	 * @private
	 */
	public async loadTodayData(): Promise<Record<string, any>> {
		return this.loadDailyData(TimeUtils.getDateToday());
	}

	/**
	 * Load the daily reading data with the specified date
	 * @param date Date(Format：YYYY-MM-DD)
	 * @returns Specific date's daily reading data
	 */
	public async loadDailyData(date: string): Promise<Record<string, any>> {
		const filePath = this.getFilePath(date);
		if (await this.app.vault.adapter.exists(filePath)) {
			try {
				const fileContent = await this.app.vault.adapter.read(filePath);
				return JSON.parse(fileContent);
			} catch (error) {
				console.error(`Failed to parse JSON file ${filePath}:`, error);
				return {};
			}
		}
		return {};
	}

	/**
	 * Get the file path
	 * @param date Date(Format：YYYY-MM-DD)
	 * @returns File path
	 */
	private getFilePath(date: string): string {
		return `${this.dataDir}/${date}.json`;
	}

	/**
	 * Save file content
	 * @param filePath
	 * @param content
	 */
	private async saveFile(filePath: string, content: string) {
		await this.app.vault.adapter.write(filePath, content);
	}
}
