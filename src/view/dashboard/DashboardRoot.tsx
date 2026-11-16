import * as React from "react";
import { TFile } from "obsidian";
import FocusTimePlugin from "../../main";
import I18n from "../../language/i18n";
import { DateUtils } from "../../util/dateUtils";
import { TimeUtils } from "../../util/timeUtils";
import { Period, getRange, previousRange } from "../../analytics/period";
import { getGoalStreak, getPeakHour, getRangeStats, sessionHistogram } from "../../analytics/metrics";
import { DateNavigator } from "../components/DateNavigator";
import {
	CalendarHeatmap,
	categoryLabel,
	FolderBars,
	HelpTip,
	HourHeatmap,
	Icon,
	InsightItem,
	InsightList,
	KpiCard,
	NoteBars,
	SessionHistogram,
	TrendBars
} from "./charts";

type Tab = "overview" | "trends" | "notes" | "categories";

const TAB_ICONS: Array<{id: Tab; icon: string; label: string}> = [
	{id: "overview", icon: "layout-dashboard", label: "dashboard.tabs.overview"},
	{id: "trends", icon: "trending-up", label: "dashboard.tabs.trends"},
	{id: "notes", icon: "files", label: "dashboard.tabs.notes"},
	{id: "categories", icon: "folder", label: "dashboard.tabs.categories"}
];

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function activate(event: React.KeyboardEvent, action: () => void): void {
	if (event.key === "Enter" || event.key === " ") {
		event.preventDefault();
		action();
	}
}

function NavButton(props: { id: Tab; icon: string; label: string; active: boolean; onClick: () => void }) {
	return (
		<div
			className={`ft-nav-button ${props.active ? "is-active" : ""}`}
			role="button"
			tabIndex={0}
			onClick={props.onClick}
			onKeyDown={(event) => activate(event, props.onClick)}
		>
			<Icon name={props.icon} className="ft-nav-icon" />
			<span>{I18n.t(props.label)}</span>
		</div>
	);
}

function Panel(props: {
	title: string;
	desc?: string;
	action?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
	help?: string;
	helpAlign?: "left" | "right" | "top";
}) {
	return (
		<section className={`ft-card ${props.className ?? ""}`}>
			<header className="ft-card-head">
				<div>
					<h2>
						{props.title}
						{props.help ? <HelpTip textKey={props.help} align={props.helpAlign} /> : null}
					</h2>
					{props.desc ? <p>{props.desc}</p> : null}
				</div>
				{props.action}
			</header>
			<div className="ft-card-body">{props.children}</div>
		</section>
	);
}

function delta(current: number, previous: number): {text: string; tone: "up" | "down" | "flat"} | undefined {
	if (previous <= 0) {
		return undefined;
	}
	const percent = Math.round(((current - previous) / previous) * 100);
	if (percent === 0) {
		return {text: "0%", tone: "flat"};
	}
	return {text: `${percent > 0 ? "+" : ""}${percent}%`, tone: percent > 0 ? "up" : "down"};
}

export function DashboardRoot(props: { plugin: FocusTimePlugin; initialTab?: Tab; initialPeriod?: Period }) {
	const {plugin} = props;
	const [tab, setTab] = React.useState<Tab>(props.initialTab ?? "overview");
	const [period, setPeriod] = React.useState<Period>(props.initialPeriod ?? "week");
	const [anchor, setAnchor] = React.useState(new Date());
	const [categoryFilter, setCategoryFilter] = React.useState<string | null>(null);
	const [, setTick] = React.useState(0);

	React.useEffect(() => {
		const offStorage = plugin.storage.onChange(() => setTick((value) => value + 1));
		const offLanguage = I18n.getInstance().onChange(() => setTick((value) => value + 1));
		return () => {
			offStorage();
			offLanguage();
		};
	}, [plugin]);

	const firstActive = plugin.storage.index.getActiveDays()[0];
	const range = getRange(period, anchor, firstActive);
	const stats = getRangeStats(plugin.storage.index, range, (noteId) => plugin.storage.getPath(noteId));
	const prev = period === "total"
		? null
		: getRangeStats(plugin.storage.index, previousRange(range), (noteId) => plugin.storage.getPath(noteId));
	const goalMs = plugin.settingsManager.getGoalMs();
	const today = DateUtils.toLocalDate();
	const todayMs = plugin.storage.index.getDayTotal(today);
	const streak = getGoalStreak(plugin.storage.index, goalMs, today);
	const totalDelta = prev ? delta(stats.totalMs, prev.totalMs) : undefined;
	const sessionDelta = prev ? delta(stats.sessionCount, prev.sessionCount) : undefined;
	const avgDelta = prev ? delta(stats.avgSessionMs, prev.avgSessionMs) : undefined;
	const goalPercent = goalMs > 0 ? Math.min(100, (todayMs / goalMs) * 100) : 0;
	const showHelp = plugin.settingsManager.get().showHelpIcons;
	const subtitle = I18n.t("dashboard.subtitle", {sessions: stats.sessionCount, notes: stats.noteCount});
	const categoryEntries = Array.from(stats.folderTotals.entries()).sort((a, b) => b[1] - a[1]);
	const categoryDesc = categoryEntries.length > 0
		? I18n.t("dashboard.categories.summary", {
			count: categoryEntries.length,
			top: categoryLabel(categoryEntries[0][0])
		})
		: I18n.t("dashboard.categories.desc");

	const insights: InsightItem[] = [];
	if (totalDelta) {
		insights.push({
			key: totalDelta.tone === "down" ? "dashboard.insight.down" : "dashboard.insight.up",
			params: {percent: totalDelta.text.replace(/[+%]/g, "")},
			tone: totalDelta.tone === "down" ? "down" : "up"
		});
	}
	if (goalMs > 0) {
		insights.push({
			key: "dashboard.insight.goal",
			params: {current: Math.round(todayMs / 60_000), goal: Math.round(goalMs / 60_000)},
			tone: todayMs >= goalMs ? "up" : "neutral"
		});
	}
	const peak = getPeakHour(stats.hourMatrix);
	if (peak) {
		insights.push({
			key: "dashboard.insight.peak",
			params: {weekday: I18n.t(`weekday.${WEEKDAY_KEYS[peak.weekday]}`), hour: peak.hour},
			tone: "neutral"
		});
	}
	if (streak > 1) {
		insights.push({key: "dashboard.insight.streak", params: {days: streak}, tone: "neutral"});
	}
	if (stats.deepWorkRatio > 0) {
		insights.push({
			key: "dashboard.insight.deepWork",
			params: {percent: Math.round(stats.deepWorkRatio * 100)},
			tone: "neutral"
		});
	}

	const openNote = (path: string) => {
		const file = plugin.app.vault.getFileByPath(path);
		if (file instanceof TFile) {
			void plugin.app.workspace.getLeaf("tab").openFile(file);
		}
	};

	const selectDay = (date: string) => {
		const parts = DateUtils.parseKey(date);
		if (parts) {
			setAnchor(DateUtils.toDate(parts));
			setPeriod("day");
		}
	};

	return (
		<div className="ft-dashboard">
			<aside className="ft-sidebar">
				<div className="ft-brand">
					<strong>Focus Time</strong>
					<span>{I18n.t("dashboard.brandSubtitle")}</span>
				</div>

				<nav className="ft-nav">
					{TAB_ICONS.map((item) => (
						<NavButton
							key={item.id}
							id={item.id}
							icon={item.icon}
							label={item.label}
							active={tab === item.id}
							onClick={() => setTab(item.id)}
						/>
					))}
				</nav>

				<div className="ft-sidebar-footer">
					<div className="ft-today-label">
						{I18n.t("dashboard.sidebar.today")}
						{showHelp ? <HelpTip textKey="help.goal" align="top" /> : null}
					</div>
					<div className="ft-today-value">{TimeUtils.getFormattedReadingTime(todayMs)}</div>
					<div className="ft-goal-track">
						<span style={{width: `${goalPercent}%`}} />
					</div>
					<div className={`ft-goal-meta ${todayMs >= goalMs ? "is-met" : ""}`}>
						{I18n.t("dashboard.sidebar.goal", {
							current: Math.round(todayMs / 60_000),
							goal: Math.round(goalMs / 60_000)
						})}
					</div>
				</div>
			</aside>

			<main className="ft-main">
				<div className="ft-main-inner">
					<header className="ft-header">
						<div className="ft-header-title">
							<h1>{I18n.t(`dashboard.tabs.${tab}`)}</h1>
							<p>{subtitle}</p>
						</div>
						<div className="ft-controls">
							<div className="ft-period-tabs" role="tablist">
								{(["day", "week", "month", "year", "total"] as Period[]).map((item) => (
									<div
										key={item}
										className={`ft-period-tab ${period === item ? "is-active" : ""}`}
										role="tab"
										tabIndex={0}
										aria-selected={period === item}
										onClick={() => setPeriod(item)}
										onKeyDown={(event) => activate(event, () => setPeriod(item))}
									>
										{I18n.t(`dashboard.views.${item}`)}
									</div>
								))}
							</div>
							{period === "total" ? (
								<span className="ft-total-range">{range.from} — {range.to}</span>
							) : (
								<DateNavigator viewType={period} currentDate={anchor} onDateChange={setAnchor} />
							)}
						</div>
					</header>

					{tab === "overview" ? (
						<div className="ft-content">
							<div className="ft-kpi-grid">
								<KpiCard
									label={I18n.t("dashboard.kpi.total")}
									value={TimeUtils.getFormattedReadingTime(stats.totalMs)}
									hint={totalDelta?.text}
									tone={totalDelta?.tone}
									icon="clock"
								/>
								<KpiCard
									label={I18n.t("dashboard.kpi.sessions")}
									value={String(stats.sessionCount)}
									hint={sessionDelta?.text}
									tone={sessionDelta?.tone}
									icon="bar-chart-3"
									help={showHelp ? "help.sessions" : undefined}
									helpAlign="right"
								/>
								<KpiCard
									label={I18n.t("dashboard.kpi.avgSession")}
									value={TimeUtils.getFormattedReadingTime(stats.avgSessionMs)}
									hint={avgDelta?.text}
									tone={avgDelta?.tone}
									icon="hourglass"
									help={showHelp ? "help.avgSession" : undefined}
								/>
								<KpiCard
									label={I18n.t("dashboard.kpi.deepWork")}
									value={`${Math.round(stats.deepWorkRatio * 100)}%`}
									hint={TimeUtils.getFormattedReadingTime(stats.deepWorkMs)}
									icon="flame"
									help={showHelp ? "help.deepWork" : undefined}
									helpAlign="right"
								/>
							</div>

							<div className="ft-overview-grid">
								<Panel
									title={I18n.t("dashboard.sections.trend")}
									action={<span className="ft-card-total">{TimeUtils.getFormattedReadingTime(stats.totalMs)}</span>}
									className="ft-span-2"
								>
									<TrendBars stats={stats} height={240} onSelectDay={selectDay} />
								</Panel>
								<Panel
									title={I18n.t("dashboard.sections.calendar")}
									help={showHelp ? "help.calendar" : undefined}
									helpAlign="right"
								>
									<CalendarHeatmap index={plugin.storage.index} anchor={anchor} onSelectDay={selectDay} />
								</Panel>
							</div>

							<div className="ft-overview-grid">
								<Panel title={I18n.t("dashboard.sections.insights")}>
									<InsightList items={insights.slice(0, 4)} />
								</Panel>
								<Panel
									title={I18n.t("dashboard.sections.topNotes")}
									action={
										<span
											className="ft-card-link"
											role="button"
											tabIndex={0}
											onClick={() => {
												setCategoryFilter(null);
												setTab("notes");
											}}
											onKeyDown={(event) => activate(event, () => {
												setCategoryFilter(null);
												setTab("notes");
											})}
										>
											{I18n.t("dashboard.seeAll")}
										</span>
									}
								>
									<NoteBars stats={stats} getPath={(id) => plugin.storage.getPath(id)} onOpen={openNote} limit={5} />
								</Panel>
							</div>
						</div>
					) : null}

					{tab === "trends" ? (
						<div className="ft-content">
							<div className="ft-kpi-grid">
								<KpiCard
									label={I18n.t("dashboard.kpi.medianSession")}
									value={TimeUtils.getFormattedReadingTime(stats.medianSessionMs)}
									icon="hourglass"
									help={showHelp ? "help.medianSession" : undefined}
								/>
								<KpiCard
									label={I18n.t("dashboard.kpi.longestSession")}
									value={TimeUtils.getFormattedReadingTime(stats.longestSessionMs)}
									icon="hourglass"
									help={showHelp ? "help.longestSession" : undefined}
									helpAlign="right"
								/>
								<KpiCard
									label={I18n.t("dashboard.kpi.switches")}
									value={String(stats.switchCount)}
									icon="shuffle"
									help={showHelp ? "help.switches" : undefined}
								/>
								<KpiCard
									label={I18n.t("dashboard.kpi.activeDays")}
									value={String(stats.activeDays)}
									icon="calendar-days"
									help={showHelp ? "help.activeDays" : undefined}
									helpAlign="right"
								/>
							</div>
							<Panel
								title={I18n.t("dashboard.sections.trend")}
								action={<span className="ft-card-total">{TimeUtils.getFormattedReadingTime(stats.totalMs)}</span>}
							>
								<TrendBars stats={stats} height={260} onSelectDay={selectDay} />
							</Panel>
							<div className="ft-two-grid">
								<Panel title={I18n.t("dashboard.sections.hourly")}>
									<HourHeatmap matrix={stats.hourMatrix} />
								</Panel>
								<Panel title={I18n.t("dashboard.sections.sessionLength")}>
									<SessionHistogram buckets={sessionHistogram(stats.sessions)} />
								</Panel>
							</div>
						</div>
					) : null}

					{tab === "notes" ? (
						<div className="ft-content">
							<Panel
								title={I18n.t("dashboard.sections.topNotes")}
								desc={categoryFilter
									? I18n.t("dashboard.notes.filterDesc", {category: categoryLabel(categoryFilter)})
									: I18n.t("dashboard.notes.desc")}
							>
								{categoryFilter ? (
									<div className="ft-filter-row">
										<span>{I18n.t("dashboard.filter")}</span>
										<span className="ft-filter-chip">
											{categoryLabel(categoryFilter)}
											<span
												className="ft-filter-clear"
												role="button"
												tabIndex={0}
												title={I18n.t("dashboard.clearFilter")}
												onClick={() => setCategoryFilter(null)}
												onKeyDown={(event) => activate(event, () => setCategoryFilter(null))}
											>
												×
											</span>
										</span>
									</div>
								) : null}
								<NoteBars
									stats={stats}
									getPath={(id) => plugin.storage.getPath(id)}
									onOpen={openNote}
									limit={30}
									category={categoryFilter}
								/>
							</Panel>
						</div>
					) : null}

					{tab === "categories" ? (
						<div className="ft-content">
							<div className="ft-two-grid">
								<Panel
									title={I18n.t("dashboard.sections.folders")}
									desc={categoryDesc}
									help={showHelp ? "help.categories" : undefined}
								>
									<FolderBars
										folders={stats.folderTotals}
										onSelect={(category) => {
											setCategoryFilter(category);
											setTab("notes");
										}}
									/>
								</Panel>
								<Panel title={I18n.t("dashboard.categories.byNotes")}>
									<FolderBars
										folders={stats.folderNoteCounts}
										mode="count"
										onSelect={(category) => {
											setCategoryFilter(category);
											setTab("notes");
										}}
									/>
								</Panel>
							</div>
						</div>
					) : null}
				</div>
			</main>
		</div>
	);
}
