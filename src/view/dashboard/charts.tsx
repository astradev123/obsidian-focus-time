import * as React from "react";
import I18n from "../../language/i18n";
import { TimeUtils } from "../../util/timeUtils";
import { DateUtils } from "../../util/dateUtils";
import { categoryForPath, OTHER_CATEGORY, RangeStats, ROOT_CATEGORY } from "../../analytics/metrics";
import { eachDate } from "../../analytics/period";
import { FocusIndex } from "../../core/storage/focusIndex";

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function activate(event: React.KeyboardEvent, action: () => void): void {
	if (event.key === "Enter" || event.key === " ") {
		event.preventDefault();
		action();
	}
}

const ICON_PATHS: Record<string, React.ReactNode> = {
	clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>,
	"bar-chart-3": <><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="4" width="3" height="14" /></>,
	hourglass: <><path d="M6 2h12M6 22h12" /><path d="M6 2c0 4 6 6 6 10s-6 6-6 10" /><path d="M18 2c0 4-6 6-6 10s6 6 6 10" /></>,
	flame: <path d="M12 2c1 4-3 6-3 10a3 3 0 0 0 6 0c0-1-.5-2-1-3 3 2 5 5 5 8a7 7 0 0 1-14 0c0-5 4-8 7-15z" />,
	"book-open-text": <><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" /></>,
	"layout-dashboard": <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
	"trending-up": <><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></>,
	files: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="14" y2="17" /></>,
	folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
	shuffle: <><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></>,
	"calendar-days": <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><circle cx="8" cy="15" r=".5" /><circle cx="12" cy="15" r=".5" /><circle cx="16" cy="15" r=".5" /></>
};

export function Icon(props: { name: string; className?: string }) {
	const content = ICON_PATHS[props.name];
	if (!content) {
		return (
			<span className={`ft-icon ${props.className ?? ""}`} aria-hidden>
				<span className="ft-icon-fallback" />
			</span>
		);
	}
	return (
		<span className={`ft-icon ${props.className ?? ""}`} aria-hidden>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
				{content}
			</svg>
		</span>
	);
}

export function HelpTip(props: { textKey: string; align?: "left" | "right" | "top"; className?: string }) {
	const [open, setOpen] = React.useState(false);
	const ref = React.useRef<HTMLSpanElement | null>(null);

	React.useEffect(() => {
		if (!open) {
			return;
		}
		const close = (event: MouseEvent) => {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", close);
		return () => document.removeEventListener("mousedown", close);
	}, [open]);

	return (
		<span
			className={`ft-help is-${props.align ?? "left"} ${props.className ?? ""} ${open ? "is-open" : ""}`}
			ref={ref}
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={() => setOpen(false)}
		>
			<span
				className="ft-help-trigger"
				role="button"
				tabIndex={0}
				aria-label={I18n.t(props.textKey)}
				aria-expanded={open}
				onClick={(event) => {
					event.stopPropagation();
					setOpen((value) => !value);
				}}
				onFocus={() => setOpen(true)}
				onBlur={() => setOpen(false)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						setOpen(false);
					}
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						setOpen((value) => !value);
					}
				}}
			>
				?
			</span>
			<span className="ft-help-popover" role="tooltip" aria-hidden={!open}>{I18n.t(props.textKey)}</span>
		</span>
	);
}

export function KpiCard(props: {
	label: string;
	value: string;
	hint?: string;
	tone?: "up" | "down" | "flat";
	icon: string;
	help?: string;
	helpAlign?: "left" | "right" | "top";
}) {
	const {label, value, hint, tone, icon, help, helpAlign} = props;
	return (
		<div className="ft-kpi">
			<div className="ft-kpi-top">
				<span className="ft-kpi-icon"><Icon name={icon} /></span>
				<span className="ft-kpi-label">
					{label}
					{help ? <HelpTip textKey={help} align={helpAlign} className="is-card" /> : null}
				</span>
			</div>
			<div className="ft-kpi-value">{value}</div>
			{hint ? <div className={`ft-kpi-hint ${tone ? `is-${tone}` : ""}`}>{hint}</div> : null}
		</div>
	);
}

function formatAxis(ms: number): string {
	const minutes = Math.round(ms / 60_000);
	if (minutes >= 60) {
		const hours = minutes / 60;
		return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
	}
	return `${minutes}m`;
}

function niceMax(ms: number): number {
	if (ms <= 0) {
		return 15 * 60_000;
	}
	const step = ms > 4 * 3_600_000 ? 3_600_000 : ms > 3_600_000 ? 30 * 60_000 : 15 * 60_000;
	return Math.ceil(ms / step) * step;
}

interface TrendEntry {
	key: string;
	label: string;
	ms: number;
	date?: string;
}

function buildTrendEntries(stats: RangeStats): TrendEntry[] {
	const totals = new Map(stats.dayTotals.map((day) => [day.date, day.ms]));
	const dates = eachDate(stats.range);

	if (dates.length <= 31) {
		return dates.map((date) => {
			const parts = DateUtils.parseKey(date);
			const weekday = parts ? DateUtils.toDate(parts).getDay() : 0;
			const label = dates.length === 7
				? I18n.t(`weekday.${WEEKDAY_KEYS[weekday]}`)
				: String(Number(date.slice(-2)));
			return {key: date, label, ms: totals.get(date) ?? 0, date};
		});
	}

	const months = new Map<string, number>();
	for (const date of dates) {
		const month = date.slice(0, 7);
		months.set(month, (months.get(month) ?? 0) + (totals.get(date) ?? 0));
	}
	const monthEntries = Array.from(months.entries());

	if (monthEntries.length > 60) {
		const years = new Map<string, number>();
		for (const [month, ms] of monthEntries) {
			const year = month.slice(0, 4);
			years.set(year, (years.get(year) ?? 0) + ms);
		}
		return Array.from(years.entries()).map(([year, ms]) => ({key: year, label: year, ms}));
	}

	const multiYear = stats.range.from.slice(0, 4) !== stats.range.to.slice(0, 4);
	const monthFormat = new Intl.DateTimeFormat(I18n.getInstance().getLanguage(), {month: "short"});
	return monthEntries.map(([month, ms]) => ({
		key: month,
		label: multiYear ? `${month.slice(2, 4)}/${month.slice(5, 7)}` : monthFormat.format(new Date(`${month}-01T00:00:00`)),
		ms
	}));
}

function formatDayLabel(date: string): string {
	const parts = DateUtils.parseKey(date);
	if (!parts) {
		return date;
	}
	return new Intl.DateTimeFormat(I18n.getInstance().getLanguage(), {
		month: "short",
		day: "numeric",
		weekday: "short"
	}).format(DateUtils.toDate(parts));
}

export function TrendBars(props: { stats: RangeStats; onSelectDay?: (date: string) => void; height?: number }) {
	const {stats, onSelectDay, height = 220} = props;
	const entries = buildTrendEntries(stats);

	if (entries.length === 0) {
		return <div className="ft-empty">{I18n.t("dashboard.empty.total")}</div>;
	}

	const max = niceMax(Math.max(...entries.map((entry) => entry.ms)));

	return (
		<div className="ft-chart" style={{height}}>
			<div className="ft-chart-axis">
				<span>{formatAxis(max)}</span>
				<span>{formatAxis(max / 2)}</span>
				<span>0</span>
			</div>
			<div className="ft-chart-plot">
				<div className="ft-bars">
					{entries.map((entry) => {
						const ratio = max > 0 ? entry.ms / max : 0;
						const title = entry.date
							? `${formatDayLabel(entry.date)} · ${TimeUtils.getFormattedReadingTime(entry.ms)}`
							: `${entry.label} · ${TimeUtils.getFormattedReadingTime(entry.ms)}`;
						const open = () => entry.date && onSelectDay?.(entry.date);
						return (
							<div
								key={entry.key}
								className={`ft-bar-col ${entry.date ? "is-clickable" : ""}`}
								role={entry.date ? "button" : undefined}
								tabIndex={entry.date ? 0 : undefined}
								title={title}
								aria-label={title}
								onClick={open}
								onKeyDown={(event) => entry.date && activate(event, open)}
							>
								<span className="ft-bar-track">
									<span className="ft-bar" style={{height: `${Math.max(ratio * 100, entry.ms > 0 ? 2 : 0)}%`}} />
								</span>
								<span className="ft-bar-label">{entry.label}</span>
							</div>
						);
					})}
				</div>
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
	let totalMs = 0;
	let activeDays = 0;
	for (let week = 0; week < 12; week++) {
		const days: string[] = [];
		for (let day = 0; day < 7; day++) {
			const date = DateUtils.toLocalDate(DateUtils.addDays(start, week * 7 + day));
			const total = index.getDayTotal(date);
			days.push(date);
			max = Math.max(max, total);
			totalMs += total;
			if (total > 0) {
				activeDays++;
			}
		}
		weeks.push(days);
	}

	return (
		<div className="ft-calendar">
			<div className="ft-calendar-body">
				<div className="ft-calendar-days">
					{WEEKDAY_KEYS.map((key) => (
						<span key={key}>{I18n.t(`weekday.${key}`)}</span>
					))}
				</div>
				<div className="ft-calendar-weeks">
					{weeks.map((week, weekIndex) => (
						<div className="ft-calendar-week" key={weekIndex}>
							{week.map((date) => {
								const total = index.getDayTotal(date);
								const level = total <= 0 ? 0 : Math.max(1, Math.ceil((total / max) * 4));
								const label = `${formatDayLabel(date)} · ${TimeUtils.getFormattedReadingTime(total)}`;
								return (
									<div
										key={date}
										className={`ft-heat-cell ft-heat-l${level}`}
										role="button"
										tabIndex={0}
										title={label}
										aria-label={label}
										onClick={() => onSelectDay?.(date)}
										onKeyDown={(event) => activate(event, () => onSelectDay?.(date))}
									/>
								);
							})}
						</div>
					))}
				</div>
			</div>
			<div className="ft-calendar-legend">
				<span>{I18n.t("dashboard.calendar.less")}</span>
				<i className="ft-heat-cell ft-heat-l1" />
				<i className="ft-heat-cell ft-heat-l2" />
				<i className="ft-heat-cell ft-heat-l3" />
				<i className="ft-heat-cell ft-heat-l4" />
				<span>{I18n.t("dashboard.calendar.more")}</span>
			</div>
			<div className="ft-calendar-summary">
				<span>{I18n.t("dashboard.calendar.total")}</span>
				<strong>{TimeUtils.getFormattedReadingTime(totalMs)}</strong>
				<span>{I18n.t("dashboard.calendar.activeDays", {days: activeDays})}</span>
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
					<span key={hour}>{hour}:00</span>
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

export function categoryLabel(key: string): string {
	if (key === ROOT_CATEGORY) {
		return I18n.t("dashboard.categories.root");
	}
	if (key === OTHER_CATEGORY) {
		return I18n.t("dashboard.categories.other");
	}
	return key;
}

export function FolderBars(props: {
	folders: Map<string, number>;
	mode?: "time" | "count";
	onSelect?: (key: string) => void;
}) {
	const {folders, mode = "time", onSelect} = props;
	const entries = Array.from(folders.entries()).sort((a, b) => b[1] - a[1]);
	if (entries.length === 0) {
		return <div className="ft-empty">{I18n.t("dashboard.empty.total")}</div>;
	}

	const otherExisting = entries.find(([key]) => key === OTHER_CATEGORY)?.[1] ?? 0;
	const named = entries.filter(([key]) => key !== OTHER_CATEGORY);
	const top = named.slice(0, 7);
	const rest = named.slice(7).reduce((sum, [, ms]) => sum + ms, 0);
	const other = otherExisting + rest;
	if (other > 0) {
		top.push([OTHER_CATEGORY, other]);
	}
	top.sort((a, b) => b[1] - a[1]);

	const max = Math.max(1, ...top.map(([, ms]) => ms));

	return (
		<div className="ft-folder-list">
			{top.map(([folder, ms]) => (
				<div
					className={`ft-folder-row ${onSelect ? "is-clickable" : ""}`}
					key={folder}
					role={onSelect ? "button" : undefined}
					tabIndex={onSelect ? 0 : undefined}
					onClick={() => onSelect?.(folder)}
					onKeyDown={(event) => onSelect && activate(event, () => onSelect(folder))}
				>
					<span className="ft-folder-name" title={categoryLabel(folder)}>{categoryLabel(folder)}</span>
					<span className="ft-folder-track">
						<span className="ft-folder-bar" style={{width: `${(ms / max) * 100}%`}} />
					</span>
					<span className="ft-folder-time">
						{mode === "count" ? I18n.t("dashboard.categories.noteCount", {count: ms}) : TimeUtils.getFormattedReadingTime(ms)}
					</span>
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
	category?: string | null;
}) {
	const {stats, getPath, onOpen, limit = 10, category} = props;
	const entries = Array.from(stats.noteTotals.entries())
		.map(([noteId, ms]) => ({noteId, ms, path: getPath(noteId) ?? ""}))
		.filter((entry) => entry.path.length > 0 && (!category || categoryForPath(entry.path) === category))
		.sort((a, b) => b.ms - a.ms)
		.slice(0, limit);

	if (entries.length === 0) {
		return <div className="ft-empty">{I18n.t("dashboard.empty.total")}</div>;
	}

	return (
		<div className="ft-note-list">
			{entries.map((entry, index) => (
				<div
					className="ft-note-row"
					key={entry.noteId}
					role="button"
					tabIndex={0}
					onClick={() => onOpen(entry.path)}
					onKeyDown={(event) => activate(event, () => onOpen(entry.path))}
					title={entry.path}
				>
					<span className="ft-note-rank">{index + 1}</span>
					<span className="ft-note-main">
						<span className="ft-note-name">{entry.path.split("/").pop()}</span>
						<span className="ft-note-path">{entry.path}</span>
					</span>
					<span className="ft-note-time">{TimeUtils.getFormattedReadingTime(entry.ms)}</span>
				</div>
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
