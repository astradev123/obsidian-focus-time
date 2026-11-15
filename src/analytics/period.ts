import { DateUtils } from "../util/dateUtils";

export type Period = "day" | "week" | "month" | "year";

export interface DateRange {
	from: string;
	to: string;
}

export function getRange(period: Period, anchor: Date): DateRange {
	if (period === "day") {
		const date = DateUtils.toLocalDate(anchor);
		return {from: date, to: date};
	}
	if (period === "week") {
		const start = DateUtils.startOfWeek(anchor);
		return {from: DateUtils.toLocalDate(start), to: DateUtils.toLocalDate(DateUtils.addDays(start, 6))};
	}
	if (period === "month") {
		const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
		const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
		return {from: DateUtils.toLocalDate(start), to: DateUtils.toLocalDate(end)};
	}
	const start = new Date(anchor.getFullYear(), 0, 1);
	const end = new Date(anchor.getFullYear(), 11, 31);
	return {from: DateUtils.toLocalDate(start), to: DateUtils.toLocalDate(end)};
}

export function shiftPeriod(period: Period, anchor: Date, delta: number): Date {
	const next = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
	if (period === "day") {
		next.setDate(next.getDate() + delta);
	} else if (period === "week") {
		next.setDate(next.getDate() + delta * 7);
	} else if (period === "month") {
		next.setMonth(next.getMonth() + delta);
	} else {
		next.setFullYear(next.getFullYear() + delta);
	}
	return next;
}

export function previousRange(range: DateRange): DateRange {
	const from = DateUtils.parseKey(range.from);
	const to = DateUtils.parseKey(range.to);
	if (!from || !to) {
		return range;
	}
	const start = DateUtils.toDate(from);
	const end = DateUtils.toDate(to);
	const length = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
	return {
		from: DateUtils.toLocalDate(DateUtils.addDays(start, -length)),
		to: DateUtils.toLocalDate(DateUtils.addDays(start, -1))
	};
}

export function eachDate(range: DateRange): string[] {
	const from = DateUtils.parseKey(range.from);
	const to = DateUtils.parseKey(range.to);
	if (!from || !to) {
		return [];
	}
	const dates: string[] = [];
	let cursor = DateUtils.toDate(from);
	const end = DateUtils.toDate(to);
	while (cursor.getTime() <= end.getTime() && dates.length < 400) {
		dates.push(DateUtils.toLocalDate(cursor));
		cursor = DateUtils.addDays(cursor, 1);
	}
	return dates;
}
