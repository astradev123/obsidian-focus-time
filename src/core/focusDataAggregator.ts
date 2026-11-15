import { App } from "obsidian";
import { DateUtils } from "../util/dateUtils";
import { StorageService } from "./storage/storageService";

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

export interface RecentYearStats {
	year: number;
	totalDuration: number;
	focusDays: number;
	noteCount: number;
}

/**
 * Read-only statistics over the in-memory event index.
 * No file I/O per query: the dashboard stays fast as history grows.
 */
export class FocusDataAggregator {
	private readonly app: App;
	private readonly storage: StorageService;

	constructor(app: App, storage: StorageService) {
		this.app = app;
		this.storage = storage;
	}

	async getDailyStats(date: string): Promise<DailyStats | null> {
		const normalizedDate = DateUtils.normalizeKey(date);
		const day = this.storage.index.getDay(normalizedDate);
		const notes: Array<{ filePath: string; fileId: string; duration: number }> = [];
		let totalDuration = 0;

		for (const [noteId, duration] of day.notes) {
			const filePath = this.storage.getPath(noteId);
			if (!filePath || !this.app.vault.getFileByPath(filePath)) {
				continue;
			}
			notes.push({filePath, fileId: noteId, duration});
			totalDuration += duration;
		}

		return {
			date: normalizedDate,
			noteCount: notes.length,
			totalDuration,
			notes
		};
	}

	async getMonthlyStats(year: number, month: number): Promise<MonthlyStats> {
		const daysInMonth = DateUtils.daysInMonth(year, month);
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

	async getWeeklyStats(date: Date): Promise<WeeklyStats> {
		const startOfWeek = DateUtils.startOfWeek(date);
		const dailyStats: DailyStats[] = [];
		let totalDuration = 0;
		let focusDays = 0;
		const noteSet = new Set<string>();

		for (let i = 0; i < 7; i++) {
			const currentDay = DateUtils.addDays(startOfWeek, i);
			const dayStats = await this.getDailyStats(DateUtils.toLocalDate(currentDay));

			if (dayStats && dayStats.totalDuration > 0) {
				dailyStats.push(dayStats);
				totalDuration += dayStats.totalDuration;
				focusDays++;
				dayStats.notes.forEach(note => noteSet.add(note.fileId));
			}
		}

		return {
			startDate: DateUtils.toLocalDate(startOfWeek),
			endDate: DateUtils.toLocalDate(DateUtils.addDays(startOfWeek, 6)),
			noteCount: noteSet.size,
			totalDuration,
			focusDays,
			dailyStats
		};
	}

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

	async getRecentYearsStats(): Promise<RecentYearStats[]> {
		const currentYear = new Date().getFullYear();
		const startYear = currentYear - 9;
		const result: RecentYearStats[] = [];

		for (let year = startYear; year <= currentYear; year++) {
			const stats = await this.getYearlyStats(year);
			if (stats.totalDuration > 0 || year === currentYear) {
				result.push({
					year,
					totalDuration: stats.totalDuration,
					focusDays: stats.focusDays,
					noteCount: stats.noteCount
				});
			}
		}

		return result;
	}

	async getTotalStats(): Promise<TotalStats> {
		const noteSet = new Set<string>();
		let totalDuration = 0;
		let focusDays = 0;

		for (const noteId of this.storage.index.getNoteIds()) {
			const filePath = this.storage.getPath(noteId);
			if (!filePath || !this.app.vault.getFileByPath(filePath)) {
				continue;
			}
			const noteTotal = this.storage.index.getNoteTotal(noteId);
			if (noteTotal > 0) {
				noteSet.add(noteId);
				totalDuration += noteTotal;
			}
		}

		for (const date of this.storage.index.getActiveDays()) {
			if (this.storage.index.getDayTotal(date) > 0) {
				focusDays++;
			}
		}

		return {
			noteCount: noteSet.size,
			totalDuration,
			focusDays
		};
	}
}
