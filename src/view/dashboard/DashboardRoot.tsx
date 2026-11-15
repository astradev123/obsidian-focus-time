import * as React from "react";
import { Notice, setIcon, TFile } from "obsidian";
import FocusTimePlugin from "../../main";
import I18n from "../../language/i18n";
import { DateUtils } from "../../util/dateUtils";
import { TimeUtils } from "../../util/timeUtils";
import { Period, getRange, previousRange } from "../../analytics/period";
import { getPeakHour, getRangeStats, getGoalStreak, sessionHistogram } from "../../analytics/metrics";
import { DateNavigator } from "../components/DateNavigator";
import {
	CalendarHeatmap,
	FolderBars,
	HourHeatmap,
	InsightItem,
	InsightList,
	KpiCard,
	NoteBars,
	SessionHistogram,
	TrendBars,
	TrendLegend
} from "./charts";

type Tab = "overview" | "trends" | "notes" | "categories" | "quality";

const TAB_ICONS: Array<{id: Tab; icon: string; label: string}> = [
	{id: "overview", icon: "layout-dashboard", label: "dashboard.tabs.overview"},
	{id: "trends", icon: "trending-up", label: "dashboard.tabs.trends"},
	{id: "notes", icon: "files", label: "dashboard.tabs.notes"},
	{id: "categories", icon: "folder", label: "dashboard.tabs.categories"},
	{id: "quality", icon: "database", label: "dashboard.tabs.quality"}
];

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function NavButton(props: { id: Tab; icon: string; label: string; active: boolean; onClick: () => void }) {
	const iconRef = React.useRef<HTMLSpanElement | null>(null);
	React.useEffect(() => {
		if (iconRef.current) {
			setIcon(iconRef.current, props.icon);
		}
	}, [props.icon]);

	return (
		<button type="button" className={`ft-nav-button ${props.active ? "is-active" : ""}`} onClick={props.onClick}>
			<span className="ft-nav-icon" ref={iconRef} aria-hidden />
			<span>{I18n.t(props.label)}</span>
		</button>
	);
}

function Panel(props: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
	return (
		<section className={`ft-panel ${props.className ?? ""}`}>
			<header className="ft-panel-head">
				<h3>{props.title}</h3>
				{props.action}
			</header>
			{props.children}
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

export function DashboardRoot(props: { plugin: FocusTimePlugin }) {
	const {plugin} = props;
	const [tab, setTab] = React.useState<Tab>("overview");
	const [period, setPeriod] = React.useState<Period>("week");
	const [anchor, setAnchor] = React.useState(new Date());
	const [, setTick] = React.useState(0);
	const [busy, setBusy] = React.useState(false);

	React.useEffect(() => {
		const offStorage = plugin.storage.onChange(() => setTick((value) => value + 1));
		const offLanguage = I18n.getInstance().onChange(() => setTick((value) => value + 1));
		return () => {
			offStorage();
			offLanguage();
		};
	}, [plugin]);

	const range = getRange(period, anchor);
	const stats = getRangeStats(plugin.storage.index, range, (noteId) => plugin.storage.getPath(noteId));
	const prev = getRangeStats(plugin.storage.index, previousRange(range), (noteId) => plugin.storage.getPath(noteId));
	const goalMs = plugin.settingsManager.getGoalMs();
	const today = DateUtils.toLocalDate();
	const todayMs = plugin.storage.index.getDayTotal(today);
	const streak = getGoalStreak(plugin.storage.index, goalMs, today);
	const totalDelta = delta(stats.totalMs, prev.totalMs);
	const sessionDelta = delta(stats.sessionCount, prev.sessionCount);
	const avgDelta = delta(stats.avgSessionMs, prev.avgSessionMs);

	const insights: InsightItem[] = [];
	if (totalDelta) {
		insights.push({
			key: totalDelta.tone === "down" ? "dashboard.insight.down" : "dashboard.insight.up",
			params: {percent: totalDelta.text.replace(/[+%]/g, "")},
			tone: totalDelta.tone === "down" ? "down" : "up"
		});
	}
	const peak = getPeakHour(stats.hourMatrix);
	if (goalMs > 0) {
		insights.push({
			key: "dashboard.insight.goal",
			params: {current: Math.round(todayMs / 60_000), goal: Math.round(goalMs / 60_000)},
			tone: todayMs >= goalMs ? "up" : "neutral"
		});
	}
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
	if (stats.legacyDays > 0) {
		insights.push({key: "dashboard.insight.legacy", params: {days: stats.legacyDays}, tone: "warning"});
	}

	const openNote = (path: string) => {
		const file = plugin.app.vault.getFileByPath(path);
		if (file instanceof TFile) {
			void plugin.app.workspace.getLeaf("tab").openFile(file);
		}
	};

	const onRescan = async () => {
		setBusy(true);
		try {
			const imported = await plugin.rescanLegacy();
			new Notice(I18n.t("dashboard.quality.rescanDone", {count: imported}));
			setTick((value) => value + 1);
		} finally {
			setBusy(false);
		}
	};

	const quality = plugin.storage.getStats();
	const showPeriodControls = tab !== "quality";

	return (
		<div className="ft-dashboard">
			<aside className="ft-sidebar">
				<div className="ft-brand">{I18n.t("app.title")}</div>
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
			</aside>

			<main className="ft-main">
				<header className="ft-header">
					<div className="ft-header-title">
						<h2>{I18n.t(`dashboard.tabs.${tab}`)}</h2>
						<p>{I18n.t("dashboard.subtitle", {sessions: stats.sessionCount, notes: stats.noteCount})}</p>
					</div>
					{showPeriodControls ? (
						<div className="ft-controls">
							<div className="ft-period-tabs" role="tablist">
								{(["day", "week", "month", "year"] as Period[]).map((item) => (
									<button
										key={item}
										type="button"
										className={period === item ? "is-active" : ""}
										onClick={() => setPeriod(item)}
									>
										{I18n.t(`dashboard.views.${item}`)}
									</button>
								))}
							</div>
							<DateNavigator viewType={period} currentDate={anchor} onDateChange={setAnchor} />
						</div>
					) : null}
				</header>

				{tab === "overview" ? (
					<div className="ft-content">
						<div className="ft-kpis">
							<KpiCard
								label={I18n.t("dashboard.kpi.total")}
								value={TimeUtils.getFormattedReadingTime(stats.totalMs)}
								hint={totalDelta?.text}
								tone={totalDelta?.tone}
							/>
							<KpiCard
								label={I18n.t("dashboard.kpi.sessions")}
								value={String(stats.sessionCount)}
								hint={sessionDelta?.text}
								tone={sessionDelta?.tone}
							/>
							<KpiCard
								label={I18n.t("dashboard.kpi.avgSession")}
								value={TimeUtils.getFormattedReadingTime(stats.avgSessionMs)}
								hint={avgDelta?.text}
								tone={avgDelta?.tone}
							/>
							<KpiCard
								label={I18n.t("dashboard.kpi.deepWork")}
								value={`${Math.round(stats.deepWorkRatio * 100)}%`}
								hint={TimeUtils.getFormattedReadingTime(stats.deepWorkMs)}
							/>
						</div>

						<div className="ft-grid ft-grid-2">
							<Panel title={I18n.t("dashboard.sections.trend")} action={<TrendLegend />}>
								<TrendBars
									stats={stats}
									onSelectDay={(date) => {
										const parts = DateUtils.parseKey(date);
										if (parts) {
											setAnchor(DateUtils.toDate(parts));
											setPeriod("day");
										}
									}}
								/>
							</Panel>
							<Panel title={I18n.t("dashboard.sections.calendar")}>
								<CalendarHeatmap
									index={plugin.storage.index}
									anchor={anchor}
									onSelectDay={(date) => {
										const parts = DateUtils.parseKey(date);
										if (parts) {
											setAnchor(DateUtils.toDate(parts));
											setPeriod("day");
										}
									}}
								/>
							</Panel>
						</div>

						<div className="ft-grid ft-grid-2">
							<Panel title={I18n.t("dashboard.sections.insights")}>
								<InsightList items={insights.slice(0, 4)} />
							</Panel>
							<Panel title={I18n.t("dashboard.sections.topNotes")}>
								<NoteBars stats={stats} getPath={(id) => plugin.storage.getPath(id)} onOpen={openNote} limit={5} />
							</Panel>
						</div>
					</div>
				) : null}

				{tab === "trends" ? (
					<div className="ft-content">
						<div className="ft-kpis">
							<KpiCard
								label={I18n.t("dashboard.kpi.medianSession")}
								value={TimeUtils.getFormattedReadingTime(stats.medianSessionMs)}
							/>
							<KpiCard
								label={I18n.t("dashboard.kpi.longestSession")}
								value={TimeUtils.getFormattedReadingTime(stats.longestSessionMs)}
							/>
							<KpiCard
								label={I18n.t("dashboard.kpi.switches")}
								value={String(stats.switchCount)}
							/>
							<KpiCard
								label={I18n.t("dashboard.kpi.activeDays")}
								value={String(stats.activeDays)}
							/>
						</div>
						<Panel title={I18n.t("dashboard.sections.trend")} action={<TrendLegend />}>
							<TrendBars stats={stats} height={240} />
						</Panel>
						<div className="ft-grid ft-grid-2">
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
						<Panel title={I18n.t("dashboard.sections.topNotes")}>
							<NoteBars stats={stats} getPath={(id) => plugin.storage.getPath(id)} onOpen={openNote} limit={30} />
						</Panel>
					</div>
				) : null}

				{tab === "categories" ? (
					<div className="ft-content">
						<Panel title={I18n.t("dashboard.sections.folders")}>
							<FolderBars folders={stats.folderTotals} />
						</Panel>
					</div>
				) : null}

				{tab === "quality" ? (
					<div className="ft-content">
						<div className="ft-kpis">
							<KpiCard label={I18n.t("dashboard.quality.events")} value={String(quality.events)} />
							<KpiCard label={I18n.t("dashboard.quality.sessions")} value={String(quality.sessions)} />
							<KpiCard label={I18n.t("dashboard.quality.notes")} value={`${quality.notes} / ${quality.registeredNotes}`} />
							<KpiCard
								label={I18n.t("dashboard.quality.unmapped")}
								value={TimeUtils.getFormattedReadingTime(quality.unmappedMs)}
							/>
						</div>
						<Panel
							title={I18n.t("dashboard.sections.quality")}
							action={
								<button type="button" className="ft-button" disabled={busy} onClick={() => void onRescan()}>
									{busy ? I18n.t("common.loading") : I18n.t("dashboard.quality.rescan")}
								</button>
							}
						>
							<div className="ft-quality-grid">
								<div><span>{I18n.t("dashboard.quality.schema")}</span><strong>{quality.schemaVersion}</strong></div>
								<div><span>{I18n.t("dashboard.quality.legacyDays")}</span><strong>{quality.legacyDays}</strong></div>
								<div><span>{I18n.t("dashboard.quality.migrated")}</span><strong>{quality.migratedAt ? new Date(quality.migratedAt).toLocaleString(I18n.getInstance().getLanguage()) : "—"}</strong></div>
								<div><span>{I18n.t("dashboard.quality.folder")}</span><strong>{quality.dataFolder}</strong></div>
							</div>
						</Panel>
					</div>
				) : null}
			</main>
		</div>
	);
}
