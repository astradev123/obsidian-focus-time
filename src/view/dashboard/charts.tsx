import * as React from "react";
import I18n from "../../language/i18n";
import { TimeUtils } from "../../util/timeUtils";
import { DateUtils } from "../../util/dateUtils";
import { DayKinds, RangeStats } from "../../analytics/metrics";
import { eachDate } from "../../analytics/period";
import { FocusIndex } from "../../core/storage/focusIndex";

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function KpiCard(props: { label: string; value: string; hint?: string; tone?: "up" | "down" | "flat" }) {
	const {label, value, hint, tone} = props;
	return (
		<div className="ft-kpi">
			<div className="ft-kpi-label">{label}</div>
			<div className="ft-kpi-value">{value}</div>
			{hint ? <div className={`ft-kpi-hint ${tone ? `is-${tone}` : ""}`}>{hint}</div> : null}
		</div>
	);
}

function formatDayLabel(date: string, options: Intl.DateTimeFormatOptions): string {
	const parts = DateUtils.parseKey(date);
	if (!parts) {
		return date;
	}
	return new Intl.DateTimeFormat(I18n.getInstance().getLanguage(), options).format(DateUtils.toDate(parts));
}

interface TrendEntry {
	key: string;
	label: string;
	kinds: DayKinds;
	clickableDate?: string;
}

function buildTrendEntries(stats: RangeStats): TrendEntry[] {
	const dates = eachDate(stats.range);

	if (dates.length <= 31) {
		return dates.map((date) => ({
			key: date,
			label: formatDayLabel(date, {month: "short", day: "numeric"}),
			kinds: stats.dayKinds.get(date) ?? {edit: 0, read: 0, legacy: 0, total: 0},
			clickableDate: date
		}));
	}

	const groups = new Map<string, DayKinds>();
	for (const date of dates) {
		const month = date.slice(0, 7);
		const target = groups.get(month) ?? {edit: 0, read: 0, legacy: 0, total: 0};
		const kinds = stats.dayKinds.get(date);
		if (kinds) {
			target.edit += kinds.edit;
			target.read += kinds.read;
			target.legacy += kinds.legacy;
			target.total += kinds.total;
		}
		groups.set(month, target);
	}

	return Array.from(groups.entries()).map(([month, kinds]) => ({
		key: month,
		label: formatDayLabel(`${month}-01`, {month: "short"}),
		kinds
	}));
}

export function TrendLegend() {
	return (
		<div className="ft-legend-row">
			<span><i className="ft-dot ft-dot-edit" />{I18n.t("dashboard.legend.edit")}</span>
			<span><i className="ft-dot ft-dot-read" />{I18n.t("dashboard.legend.read")}</span>
			<span><i className="ft-dot ft-dot-legacy" />{I18n.t("dashboard.legend.legacy")}</span>
		</div>
	);
}

export function TrendBars(props: { stats: RangeStats; onSelectDay?: (date: string) => void; height?: number }) {
	const {stats, onSelectDay, height = 180} = props;
	const entries = buildTrendEntries(stats);

	if (entries.length === 0) {
		return <div className="ft-empty">{I18n.t("dashboard.empty.total")}</div>;
	}

	const max = Math.max(1, ...entries.map((entry) => entry.kinds.total));

	return (
		<div className="ft-trend" style={{height}}>
			<div className="ft-trend-grid">
				<span>100%</span>
				<span>50%</span>
				<span>0</span>
			</div>
			<div className="ft-trend-bars">
				{entries.map((entry) => {
					const total = entry.kinds.total;
					const ratio = max > 0 ? total / max : 0;
					const editPart = total > 0 ? (entry.kinds.edit / total) * 100 : 0;
					const readPart = total > 0 ? (entry.kinds.read / total) * 100 : 0;
					const legacyPart = total > 0 ? (entry.kinds.legacy / total) * 100 : 0;
					const label = `${entry.label} · ${TimeUtils.getFormattedReadingTime(total)}`;

					return (
						<button
							key={entry.key}
							type="button"
							className={`ft-trend-col ${entry.clickableDate ? "is-clickable" : ""}`}
							title={label}
							aria-label={label}
							onClick={() => entry.clickableDate && onSelectDay?.(entry.clickableDate)}
						>
							<span className="ft-trend-stack" style={{height: `${Math.max(ratio * 100, total > 0 ? 2 : 0)}%`}}>
								<span className="ft-trend-edit" style={{height: `${editPart}%`}} />
								<span className="ft-trend-read" style={{height: `${readPart}%`}} />
								<span className="ft-trend-legacy" style={{height: `${legacyPart}%`}} />
							</span>
							<span className="ft-trend-label">{entry.label}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

export function CalendarHeatmap(props: {
	index: FocusIndex;
	anchor: Date;
	onSelectDay?: (date: string) => void;
}) {
	const {index, anchor, onSelectDay} = props;
	const weeks: string[][] = [];
	const start = DateUtils.addDays(DateUtils.startOfWeek(anchor), -7 * 11);

	let max = 1;
	for (let week = 0; week < 12; week++) {
		const days: string[] = [];
		for (let day = 0; day < 7; day++) {
			const date = DateUtils.toLocalDate(DateUtils.addDays(start, week * 7 + day));
			days.push(date);
			max = Math.max(max, index.getDayTotal(date));
		}
		weeks.push(days);
	}

	return (
		<div className="ft-calendar">
			<div className="ft-calendar-weeks">
				{weeks.map((week, weekIndex) => (
					<div className="ft-calendar-week" key={weekIndex}>
						{week.map((date) => {
							const total = index.getDayTotal(date);
							const level = total <= 0 ? 0 : Math.max(1, Math.ceil((total / max) * 4));
							const label = `${date} · ${TimeUtils.getFormattedReadingTime(total)}`;
							return (
								<button
									type="button"
									key={date}
									className={`ft-heat-cell ft-heat-l${level}`}
									title={label}
									aria-label={label}
									onClick={() => onSelectDay?.(date)}
								/>
							);
						})}
					</div>
				))}
			</div>
			<div className="ft-calendar-footer">
				<span className="ft-legend">
					<i className="ft-heat-cell ft-heat-l1" />
					<i className="ft-heat-cell ft-heat-l2" />
					<i className="ft-heat-cell ft-heat-l3" />
					<i className="ft-heat-cell ft-heat-l4" />
				</span>
			</div>
		</div>
	);
}

export function HourHeatmap(props: { matrix: number[][] }) {
	const {matrix} = props;
	let max = 1;
	for (const row of matrix) {
		for (const ms of row) {
			max = Math.max(max, ms);
		}
	}

	const hours = [0, 6, 12, 18, 23];

	return (
		<div className="ft-hour">
			<div className="ft-hour-head">
				<span />
				{hours.map((hour) => (
					<span key={hour} className="ft-hour-tick">{hour}:00</span>
				))}
			</div>
			{matrix.map((row, weekday) => (
				<div className="ft-hour-row" key={weekday}>
					<span className="ft-hour-day">{I18n.t(`weekday.${WEEKDAY_KEYS[weekday]}`)}</span>
					<div className="ft-hour-cells">
						{row.map((ms, hour) => {
							const level = ms <= 0 ? 0 : Math.max(1, Math.ceil((ms / max) * 4));
							return (
								<span
									key={hour}
									className={`ft-hour-cell ft-heat-l${level}`}
									title={`${I18n.t(`weekday.${WEEKDAY_KEYS[weekday]}`)} ${hour}:00 · ${TimeUtils.getFormattedReadingTime(ms)}`}
								/>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}

export function SessionHistogram(props: { buckets: number[] }) {
	const {buckets} = props;
	const labels = [
		I18n.t("dashboard.buckets.lt5"),
		I18n.t("dashboard.buckets.lt15"),
		I18n.t("dashboard.buckets.lt30"),
		I18n.t("dashboard.buckets.lt60"),
		I18n.t("dashboard.buckets.gt60")
	];
	const max = Math.max(1, ...buckets);

	return (
		<div className="ft-histogram">
			{buckets.map((count, index) => (
				<div className="ft-histogram-col" key={labels[index]}>
					<span className="ft-histogram-count">{count}</span>
					<span className="ft-histogram-bar" style={{height: `${(count / max) * 100}%`}} />
					<span className="ft-histogram-label">{labels[index]}</span>
				</div>
			))}
		</div>
	);
}

export function FolderBars(props: { folders: Map<string, number> }) {
	const {folders} = props;
	const entries = Array.from(folders.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
	if (entries.length === 0) {
		return <div className="ft-empty">{I18n.t("dashboard.empty.total")}</div>;
	}
	const max = Math.max(1, ...entries.map(([, ms]) => ms));

	return (
		<div className="ft-folder-list">
			{entries.map(([folder, ms]) => (
				<div className="ft-folder-row" key={folder || "root"}>
					<span className="ft-folder-name" title={folder || "/"}>{folder || "/"}</span>
					<span className="ft-folder-track">
						<span className="ft-folder-bar" style={{width: `${(ms / max) * 100}%`}} />
					</span>
					<span className="ft-folder-time">{TimeUtils.getFormattedReadingTime(ms)}</span>
				</div>
			))}
		</div>
	);
}

export function NoteBars(props: {
	stats: RangeStats;
	getPath: (noteId: string) => string | undefined;
	onOpen: (path: string) => void;
	limit?: number;
}) {
	const {stats, getPath, onOpen, limit = 12} = props;
	const entries = Array.from(stats.noteTotals.entries())
		.map(([noteId, ms]) => ({noteId, ms, path: getPath(noteId) ?? ""}))
		.filter((entry) => entry.path.length > 0)
		.sort((a, b) => b.ms - a.ms)
		.slice(0, limit);

	if (entries.length === 0) {
		return <div className="ft-empty">{I18n.t("dashboard.empty.total")}</div>;
	}

	const max = Math.max(1, ...entries.map((entry) => entry.ms));

	return (
		<div className="ft-note-list">
			{entries.map((entry, index) => (
				<button
					type="button"
					className="ft-note-row"
					key={entry.noteId}
					onClick={() => onOpen(entry.path)}
					title={entry.path}
				>
					<span className="ft-note-rank">{index + 1}</span>
					<span className="ft-note-main">
						<span className="ft-note-name">{entry.path.split("/").pop()}</span>
						<span className="ft-note-path">{entry.path}</span>
						<span className="ft-note-track">
							<span className="ft-note-bar" style={{width: `${(entry.ms / max) * 100}%`}} />
						</span>
					</span>
					<span className="ft-note-time">{TimeUtils.getFormattedReadingTime(entry.ms)}</span>
				</button>
			))}
		</div>
	);
}

export interface InsightItem {
	key: string;
	params?: Record<string, string | number>;
	tone: "up" | "down" | "neutral" | "warning";
}

export function InsightList(props: { items: InsightItem[] }) {
	const {items} = props;
	if (items.length === 0) {
		return <div className="ft-empty">{I18n.t("dashboard.insight.none")}</div>;
	}
	return (
		<div className="ft-insights">
			{items.map((item, index) => (
				<div className={`ft-insight is-${item.tone}`} key={`${item.key}-${index}`}>
					<span className="ft-insight-dot" />
					<span>{I18n.t(item.key, item.params)}</span>
				</div>
			))}
		</div>
	);
}
