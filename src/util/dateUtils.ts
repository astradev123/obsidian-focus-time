export interface DateParts {
	year: number;
	month: number;
	day: number;
}

export class DateUtils {
	/**
	 * Zero-padded local date: `2026-01-05`.
	 */
	static toLocalDate(date: Date = new Date()): string {
		return `${date.getFullYear()}-${DateUtils.pad2(date.getMonth() + 1)}-${DateUtils.pad2(date.getDate())}`;
	}

	static toLocalDateFromMs(ms: number): string {
		return DateUtils.toLocalDate(new Date(ms));
	}

	/**
	 * Accepts `2026-1-5`, `2026-01-05`, `2026-1-5.json` and returns `2026-01-05`.
	 */
	static normalizeKey(key: string): string {
		const parts = DateUtils.parseKey(key);
		if (!parts) {
			return key;
		}
		return `${parts.year}-${DateUtils.pad2(parts.month)}-${DateUtils.pad2(parts.day)}`;
	}

	static parseKey(key: string): DateParts | null {
		const cleaned = key.replace(/\.json$/i, "").trim();
		const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(cleaned);
		if (!match) {
			return null;
		}
		const year = Number(match[1]);
		const month = Number(match[2]);
		const day = Number(match[3]);
		if (month < 1 || month > 12 || day < 1 || day > 31) {
			return null;
		}
		return { year, month, day };
	}

	static toDate(parts: DateParts): Date {
		return new Date(parts.year, parts.month - 1, parts.day);
	}

	static daysInMonth(year: number, month: number): number {
		return new Date(year, month, 0).getDate();
	}

	/**
	 * Local midnight after the given timestamp.
	 */
	static nextMidnightMs(ms: number): number {
		const date = new Date(ms);
		date.setHours(24, 0, 0, 0);
		return date.getTime();
	}

	/**
	 * Start of the week (Sunday-based, matching the existing dashboard).
	 */
	static startOfWeek(date: Date): Date {
		const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		result.setDate(result.getDate() - result.getDay());
		return result;
	}

	static addDays(date: Date, days: number): Date {
		const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		result.setDate(result.getDate() + days);
		return result;
	}

	static isSameLocalDate(a: Date, b: Date): boolean {
		return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
	}

	private static pad2(value: number): string {
		return value < 10 ? `0${value}` : String(value);
	}
}
