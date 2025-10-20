import {App} from "obsidian";
import {PluginDataManager} from "./pluginDataManager";
import {DailyReadDataManager} from "./dailyReadDataManager";

export interface DailyStats {
	date: string;
	noteCount: number;
	totalDuration: number;
	notes: Array<{filePath: string; fileId: string; duration: number}>;
}

export interface MonthlyStats {
	year: number;
	month: number;
	noteCount: number;
	totalDuration: number;
	focusDays: number;
	dailyStats: DailyStats[];
}

export interface YearlyStats {
	year: number;
	noteCount: number;
	totalDuration: number;
	focusDays: number;
	monthlyStats: MonthlyStats[];
}

export interface TotalStats {
	noteCount: number;
	totalDuration: number;
	focusDays: number;
}

export class FocusDataAggregator {
	private readonly app: App;
	private readonly dataManager: PluginDataManager;
	private readonly dailyReadDataManager: DailyReadDataManager;

	constructor(app: App, dataManager: PluginDataManager, dailyReadDataManager: DailyReadDataManager) {
		this.app = app;
		this.dataManager = dataManager;
		this.dailyReadDataManager = dailyReadDataManager;
	}

	/**
	 * Get statistics for a specific date
	 */
	async getDailyStats(date: string): Promise<DailyStats | null> {
		const dailyData = await this.dailyReadDataManager.loadDailyData(date);
		
		if (!dailyData || !dailyData.dailyReadData) {
			return null;
		}

		const readData = dailyData.dailyReadData;
		const notes: Array<{filePath: string; fileId: string; duration: number}> = [];
		let totalDuration = 0;

		const totalReadData = this.dataManager.getCategory("readData");

		for (const fileId in readData) {
			const record = readData[fileId];
			
			let filePath = "";
			if (totalReadData) {
				for (const path in totalReadData) {
					if (totalReadData[path].fileId === fileId) {
						filePath = path;
						break;
					}
				}
			}
			
			// Skip deleted files
			if (!filePath) {
				continue;
			}
			
			const file = this.app.vault.getFileByPath(filePath);
			if (!file) {
				continue; // File was deleted
			}
			
			totalDuration += record.duration;
			notes.push({
				filePath: filePath,
				fileId: fileId,
				duration: record.duration
			});
		}

		return {
			date,
			noteCount: notes.length,
			totalDuration,
			notes
		};
	}

	/**
	 * Get statistics for a specific month
	 */
	async getMonthlyStats(year: number, month: number): Promise<MonthlyStats> {
		const daysInMonth = new Date(year, month, 0).getDate();
		const dailyStats: DailyStats[] = [];
		let totalDuration = 0;
		let focusDays = 0;
		const noteSet = new Set<string>();

		for (let day = 1; day <= daysInMonth; day++) {
			const date = `${year}-${month}-${day}`;
			const dayStats = await this.getDailyStats(date);
			
			if (dayStats && dayStats.totalDuration > 0) {
				dailyStats.push(dayStats);
				totalDuration += dayStats.totalDuration;
				focusDays++;
				dayStats.notes.forEach(note => noteSet.add(note.fileId));
			}
		}

		return {
			year,
			month,
			noteCount: noteSet.size,
			totalDuration,
			focusDays,
			dailyStats
		};
	}

	/**
	 * Get statistics for a specific year
	 */
	async getYearlyStats(year: number): Promise<YearlyStats> {
		const monthlyStats: MonthlyStats[] = [];
		let totalDuration = 0;
		let focusDays = 0;
		const noteSet = new Set<string>();

		for (let month = 1; month <= 12; month++) {
			const monthStats = await this.getMonthlyStats(year, month);
			
			if (monthStats.totalDuration > 0) {
				monthlyStats.push(monthStats);
				totalDuration += monthStats.totalDuration;
				focusDays += monthStats.focusDays;
				// Collect unique notes across all days in the month
				monthStats.dailyStats.forEach(dayStats => {
					dayStats.notes.forEach(note => noteSet.add(note.fileId));
				});
			}
		}

		return {
			year,
			noteCount: noteSet.size,
			totalDuration,
			focusDays,
			monthlyStats
		};
	}

	/**
	 * Get statistics for recent years (last 10 years)
	 */
	async getRecentYearsStats(): Promise<Array<{year: number; totalDuration: number; focusDays: number; noteCount: number}>> {
		const currentYear = new Date().getFullYear();
		const startYear = currentYear - 9; // Last 10 years
		const yearlyData: Array<{year: number; totalDuration: number; focusDays: number; noteCount: number}> = [];

		for (let year = startYear; year <= currentYear; year++) {
			try {
				const stats = await this.getYearlyStats(year);
				if (stats.totalDuration > 0 || year === currentYear) {
					yearlyData.push({
						year,
						totalDuration: stats.totalDuration,
						focusDays: stats.focusDays,
						noteCount: stats.noteCount
					});
				}
			} catch (error) {
				console.error(`Failed to get yearly stats for ${year}:`, error);
				yearlyData.push({
					year,
					totalDuration: 0,
					focusDays: 0,
					noteCount: 0
				});
			}
		}

		return yearlyData;
	}

	/**
	 * Get total statistics
	 */
	async getTotalStats(): Promise<TotalStats> {
		const dataDir = `${this.app.vault.configDir}/plugins/focus-time/data`;
		let files: string[] = [];
		
		try {
			files = await this.app.vault.adapter.list(dataDir).then(result => result.files);
		} catch (e) {
			return {
				noteCount: 0,
				totalDuration: 0,
				focusDays: 0
			};
		}

		const noteSet = new Set<string>();
		let totalDuration = 0;
		let focusDays = 0;

		for (const file of files) {
			if (!file.endsWith('.json')) continue;
			
			const fileName = file.split('/').pop()?.replace('.json', '');
			if (!fileName) continue;

			try {
				const dayStats = await this.getDailyStats(fileName);
				if (dayStats && dayStats.totalDuration > 0) {
					totalDuration += dayStats.totalDuration;
					focusDays++;
					// Only add notes that still exist (getDailyStats already filters deleted files)
					dayStats.notes.forEach(note => noteSet.add(note.fileId));
				}
			} catch (error) {
				console.error(`Failed to process daily stats for ${fileName}:`, error);
				continue;
			}
		}

		return {
			noteCount: noteSet.size,
			totalDuration,
			focusDays
		};
	}
}

