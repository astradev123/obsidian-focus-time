import { App } from "obsidian";
import { PluginDataManager } from "./pluginDataManager";
import { DailyReadDataManager } from "./dailyReadDataManager";
import { DateUtils } from "../util/dateUtils";

export interface DailyStats {
	date: string;
	noteCount: number;
	totalDuration: number;
	notes: Array<{ filePath: string; fileId: string; duration: number }>;
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

export interface WeeklyStats {
	startDate: string;
	endDate: string;
	noteCount: number;
	totalDuration: number;
	focusDays: number;
	dailyStats: DailyStats[];
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
		const normalizedDate = DateUtils.normalizeKey(date);
		const dailyData = await this.dailyReadDataManager.loadDailyData(normalizedDate);

		if (!dailyData || !dailyData.dailyReadData) {
			return null;
		}

		const readData = dailyData.dailyReadData as Record<string, { duration: number; fileId?: string }>;
		const notes: Array<{ filePath: string; fileId: string; duration: number }> = [];
		let totalDuration = 0;

		for (const fileId in readData) {
			const record = readData[fileId];
			if (!record) {
				continue;
			}

			const filePath = this.dataManager.getPathByFileId(fileId);

			// Skip deleted files and legacy records that cannot be mapped.
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
			date: normalizedDate,
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
			const date = DateUtils.toLocalDate(new Date(year, month - 1, day));
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
	 * Get statistics for a specific week
	 */
	async getWeeklyStats(date: Date): Promise<WeeklyStats> {
		const startOfWeek = new Date(date);
		const day = startOfWeek.getDay(); // 0 is Sunday
		const diff = startOfWeek.getDate() - day; // Adjust to Sunday
		startOfWeek.setDate(diff);

		const dailyStats: DailyStats[] = [];
		let totalDuration = 0;
		let focusDays = 0;
		const noteSet = new Set<string>();

		const currentDay = new Date(startOfWeek);
		for (let i = 0; i < 7; i++) {
			const dateStr = DateUtils.toLocalDate(currentDay);
			const dayStats = await this.getDailyStats(dateStr);

			if (dayStats && dayStats.totalDuration > 0) {
				dailyStats.push(dayStats);
				totalDuration += dayStats.totalDuration;
				focusDays++;
				dayStats.notes.forEach(note => noteSet.add(note.fileId));
			}

			currentDay.setDate(currentDay.getDate() + 1);
		}

		const endDate = new Date(startOfWeek);
		endDate.setDate(endDate.getDate() + 6);

		return {
			startDate: DateUtils.toLocalDate(startOfWeek),
			endDate: DateUtils.toLocalDate(endDate),
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
	async getRecentYearsStats(): Promise<Array<{ year: number; totalDuration: number; focusDays: number; noteCount: number }>> {
		const currentYear = new Date().getFullYear();
		const startYear = currentYear - 9; // Last 10 years
		const yearlyData: Array<{ year: number; totalDuration: number; focusDays: number; noteCount: number }> = [];

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
		const dates = await this.dailyReadDataManager.listDates();
		if (dates.length === 0) {
			return {
				noteCount: 0,
				totalDuration: 0,
				focusDays: 0
			};
		}

		const noteSet = new Set<string>();
		let totalDuration = 0;
		let focusDays = 0;

		for (const date of dates) {
			try {
				const dayStats = await this.getDailyStats(date);
				if (dayStats && dayStats.totalDuration > 0) {
					totalDuration += dayStats.totalDuration;
					focusDays++;
					// Only add notes that still exist (getDailyStats already filters deleted files)
					dayStats.notes.forEach(note => noteSet.add(note.fileId));
				}
			} catch (error) {
				console.error(`Failed to process daily stats for ${date}:`, error);
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

