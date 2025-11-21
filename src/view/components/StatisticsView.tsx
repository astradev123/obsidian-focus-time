import * as React from 'react';
import FocusTimePlugin from "../../main";
import I18n from "../../language/i18n";
import { TimeUtils } from "../../util/timeUtils";
import { DateNavigator } from "./DateNavigator";
import { BarChart, BarChartData } from "./BarChart";
import { DailyStats, MonthlyStats, YearlyStats, TotalStats, WeeklyStats } from "../../core/focusDataAggregator";
import { setIcon, TFile, normalizePath } from "obsidian";

type ViewMode = 'day' | 'week' | 'month' | 'year' | 'total';

interface StatisticsViewProps {
	plugin: FocusTimePlugin;
	onSelect?: (filePath: string) => void;
}

export function StatisticsView(props: StatisticsViewProps) {
	const { plugin, onSelect } = props;

	const handleNoteClick = (filePath: string) => {
		const file = plugin.app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (file && file instanceof TFile) {
			plugin.app.workspace.getLeaf().openFile(file).finally();
			if (onSelect) {
				onSelect(filePath);
			}
		}
	};
	const [viewMode, setViewMode] = React.useState<ViewMode>('day');
	const [currentDate, setCurrentDate] = React.useState(new Date());
	const [isInitialLoad, setIsInitialLoad] = React.useState(true);
	const [isLoading, setIsLoading] = React.useState(false);
	const [dailyStats, setDailyStats] = React.useState<DailyStats | null>(null);
	const [weeklyStats, setWeeklyStats] = React.useState<WeeklyStats | null>(null);
	const [monthlyStats, setMonthlyStats] = React.useState<MonthlyStats | null>(null);
	const [yearlyStats, setYearlyStats] = React.useState<YearlyStats | null>(null);
	const [totalStats, setTotalStats] = React.useState<TotalStats | null>(null);
	const [recentYearsData, setRecentYearsData] = React.useState<Array<{ year: number; totalDuration: number; focusDays: number; noteCount: number }>>([]);
	React.useEffect(() => {
		loadData();
	}, [viewMode, currentDate]);

	const loadData = async () => {
		setIsLoading(true);
		try {
			if (viewMode === 'day') {
				const date = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${currentDate.getDate()}`;
				const stats = await plugin.focusDataAggregator.getDailyStats(date);
				setDailyStats(stats);
			} else if (viewMode === 'week') {
				const stats = await plugin.focusDataAggregator.getWeeklyStats(currentDate);
				setWeeklyStats(stats);
			} else if (viewMode === 'month') {
				const stats = await plugin.focusDataAggregator.getMonthlyStats(
					currentDate.getFullYear(),
					currentDate.getMonth() + 1
				);
				setMonthlyStats(stats);
			} else if (viewMode === 'year') {
				const stats = await plugin.focusDataAggregator.getYearlyStats(currentDate.getFullYear());
				setYearlyStats(stats);
			} else if (viewMode === 'total') {
				const stats = await plugin.focusDataAggregator.getTotalStats();
				setTotalStats(stats);
				const yearsData = await plugin.focusDataAggregator.getRecentYearsStats();
				setRecentYearsData(yearsData);
			}
		} catch (error) {
			console.error('Failed to load statistics:', error);
		} finally {
			setIsLoading(false);
			if (isInitialLoad) {
				setIsInitialLoad(false);
			}
		}
	};

	// Helper function to render loading/empty states
	const renderLoadingOrEmpty = <T extends { totalDuration: number }>(
		stats: T | null,
		emptyMessage: string
	): { shouldReturn: boolean; element?: React.ReactElement } => {
		if (isLoading && !stats) {
			return { shouldReturn: true, element: <div className="stats-loading">{I18n.t('loading')}</div> };
		}
		if (!isLoading && (!stats || stats.totalDuration === 0)) {
			return { shouldReturn: true, element: <div className="stats-no-data">{emptyMessage}</div> };
		}
		return { shouldReturn: false };
	};

	const renderDayView = () => {
		const { shouldReturn, element } = renderLoadingOrEmpty(dailyStats, I18n.t('noDataForDate'));
		if (shouldReturn) {
			return element || null;
		}
		if (!dailyStats) return null;

		return (
			<div className="stats-content">
				<div className="stats-cards">
					<StatCard icon="book-open" label={I18n.t('focusNoteCount')} value={String(dailyStats.noteCount)} />
					<StatCard icon="timer" label={I18n.t('focusTime')} value={TimeUtils.getFormattedReadingTime(dailyStats.totalDuration)} />
				</div>

				<div className="stats-note-list">
					<h3>{I18n.t('focusNotes')}</h3>
					{dailyStats.notes
						.sort((a, b) => b.duration - a.duration)
						.map((note, index) => (
							<div
								key={note.fileId}
								className="stats-note-item stats-note-clickable"
								onClick={() => handleNoteClick(note.filePath)}
								title={note.filePath}
							>
								<div className="stats-note-left">
									<div className="stats-note-name">
										{index + 1}. {note.filePath.split('/').pop() || 'Unknown'}
									</div>
									<div className="stats-note-path">
										{note.filePath}
									</div>
								</div>
								<div className="stats-note-time">
									{TimeUtils.getFormattedReadingTime(note.duration)}
								</div>
							</div>
						))}
				</div>
			</div>
		);
	};



	const renderWeekView = () => {
		const { shouldReturn, element } = renderLoadingOrEmpty(weeklyStats, I18n.t('noDataForWeek'));
		if (shouldReturn) {
			return element || null;
		}

		if (!weeklyStats) return null;

		const dailyDataMap: { [key: number]: number } = {};

		// Initialize with 0 for all days of the week (0-6)
		for (let day = 0; day < 7; day++) {
			dailyDataMap[day] = 0;
		}

		weeklyStats.dailyStats.forEach(dayStats => {
			const date = new Date(dayStats.date);
			const day = date.getDay();
			dailyDataMap[day] = dayStats.totalDuration;
		});

		const chartData: BarChartData[] = [];

		const startOfWeek = new Date(weeklyStats.startDate);
		const currentDay = new Date(startOfWeek);

		const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

		for (let i = 0; i < 7; i++) {
			const dayIndex = currentDay.getDay();
			chartData.push({
				label: I18n.t(dayKeys[dayIndex]),
				value: dailyDataMap[dayIndex]
			});
			currentDay.setDate(currentDay.getDate() + 1);
		}

		return (
			<div className="stats-content">
				<div className="stats-cards">
					<StatCard icon="book-open" label={I18n.t('focusNoteCount')} value={String(weeklyStats.noteCount)} />
					<StatCard icon="timer" label={I18n.t('focusTime')} value={TimeUtils.getFormattedReadingTime(weeklyStats.totalDuration)} />
					<StatCard icon="calendar-days" label={I18n.t('focusDays')} value={String(weeklyStats.focusDays)} />
				</div>

				<div className="stats-chart-section">
					<h3>{I18n.t('dailyDistribution')}</h3>
					<BarChart
						data={chartData}
						height={250}
						maxBars={7}
						onBarClick={(label) => {
							// Find the date corresponding to the label (day of week name)
							// We need to map back from label to date.
							// Since the chart data is generated in order from startOfWeek, we can just find the index.
							const index = chartData.findIndex(d => d.label === label);
							if (index !== -1) {
								const targetDate = new Date(weeklyStats.startDate);
								targetDate.setDate(targetDate.getDate() + index);
								setCurrentDate(new Date(targetDate));
								setViewMode('day');
							}
						}}
					/>
				</div>

				<div className="stats-note-list">
					<h3>{I18n.t('focusNotes')}</h3>
					{weeklyStats.dailyStats
						.flatMap(day => day.notes)
						.reduce((acc, note) => {
							const existing = acc.find(n => n.fileId === note.fileId);
							if (existing) {
								existing.duration += note.duration;
							} else {
								acc.push({ ...note });
							}
							return acc;
						}, [] as Array<{ filePath: string; fileId: string; duration: number }>)
						.sort((a, b) => b.duration - a.duration)
						.map((note, index) => (
							<div
								key={note.fileId}
								className="stats-note-item stats-note-clickable"
								onClick={() => handleNoteClick(note.filePath)}
								title={note.filePath}
							>
								<div className="stats-note-left">
									<div className="stats-note-name">
										{index + 1}. {note.filePath.split('/').pop() || 'Unknown'}
									</div>
									<div className="stats-note-path">
										{note.filePath}
									</div>
								</div>
								<div className="stats-note-time">
									{TimeUtils.getFormattedReadingTime(note.duration)}
								</div>
							</div>
						))}
				</div>
			</div>
		);
	};

	const renderMonthView = () => {
		const { shouldReturn, element } = renderLoadingOrEmpty(monthlyStats, I18n.t('noDataForMonth'));
		if (shouldReturn) {
			return element || null;
		}

		if (!monthlyStats) return null;

		const daysInMonth = new Date(monthlyStats.year, monthlyStats.month, 0).getDate();
		const dailyDataMap: { [key: number]: number } = {};

		for (let day = 1; day <= daysInMonth; day++) {
			dailyDataMap[day] = 0;
		}

		monthlyStats.dailyStats.forEach(dayStats => {
			const dateParts = dayStats.date.split('-');
			const day = parseInt(dateParts[2]);
			dailyDataMap[day] = dayStats.totalDuration;
		});

		const chartData: BarChartData[] = [];
		for (let day = 1; day <= daysInMonth; day++) {
			chartData.push({
				label: String(day),
				value: dailyDataMap[day]
			});
		}

		return (
			<div className="stats-content">
				<div className="stats-cards">
					<StatCard icon="book-open" label={I18n.t('focusNoteCount')} value={String(monthlyStats.noteCount)} />
					<StatCard icon="timer" label={I18n.t('focusTime')} value={TimeUtils.getFormattedReadingTime(monthlyStats.totalDuration)} />
					<StatCard icon="calendar-days" label={I18n.t('focusDays')} value={String(monthlyStats.focusDays)} />
				</div>

				<div className="stats-chart-section">
					<h3>{I18n.t('dailyDistribution')}</h3>
					<BarChart
						data={chartData}
						height={250}
						maxBars={31}
						onBarClick={(label) => {
							const day = parseInt(label);
							const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
							setCurrentDate(newDate);
							setViewMode('day');
						}}
					/>
				</div>
			</div>
		);
	};

	const renderYearView = () => {
		const { shouldReturn, element } = renderLoadingOrEmpty(yearlyStats, I18n.t('noDataForYear'));
		if (shouldReturn) {
			return element || null;
		}

		if (!yearlyStats) return null;

		const monthlyData: { [key: number]: number } = {};
		for (let i = 1; i <= 12; i++) {
			monthlyData[i] = 0;
		}

		yearlyStats.monthlyStats.forEach(month => {
			monthlyData[month.month] = month.totalDuration;
		});

		const chartData: BarChartData[] = Object.keys(monthlyData).map(month => ({
			label: month,
			value: monthlyData[parseInt(month)]
		}));

		return (
			<div className="stats-content">
				<div className="stats-cards">
					<StatCard icon="book-open" label={I18n.t('focusNoteCount')} value={String(yearlyStats.noteCount)} />
					<StatCard icon="timer" label={I18n.t('focusTime')} value={TimeUtils.getFormattedReadingTime(yearlyStats.totalDuration)} />
					<StatCard icon="calendar-days" label={I18n.t('focusDays')} value={String(yearlyStats.focusDays)} />
				</div>

				<div className="stats-chart-section">
					<h3>{I18n.t('monthlyDistribution')}</h3>
					<BarChart
						data={chartData}
						height={250}
						maxBars={12}
						onBarClick={(label) => {
							const month = parseInt(label);
							const newDate = new Date(currentDate.getFullYear(), month - 1, 1);
							setCurrentDate(newDate);
							setViewMode('month');
						}}
					/>
				</div>
			</div>
		);
	};

	const renderTotalView = () => {
		const { shouldReturn, element } = renderLoadingOrEmpty(totalStats, I18n.t('noDataAvailable'));
		if (shouldReturn) {
			return element || null;
		}

		if (!totalStats) return null;

		const currentYear = new Date().getFullYear();
		const startYear = currentYear - 9;
		const yearDataMap: { [key: number]: number } = {};

		for (let year = startYear; year <= currentYear; year++) {
			yearDataMap[year] = 0;
		}

		recentYearsData.forEach(yearData => {
			yearDataMap[yearData.year] = yearData.totalDuration;
		});

		const yearChartData: BarChartData[] = [];
		for (let year = startYear; year <= currentYear; year++) {
			yearChartData.push({
				label: String(year),
				value: yearDataMap[year]
			});
		}

		return (
			<div className="stats-content">
				<div className="stats-cards">
					<StatCard icon="book-open" label={I18n.t('totalNoteCount')} value={String(totalStats.noteCount)} />
					<StatCard icon="timer" label={I18n.t('totalFocusTime')} value={TimeUtils.getFormattedReadingTime(totalStats.totalDuration)} />
					<StatCard icon="calendar-days" label={I18n.t('totalFocusDays')} value={String(totalStats.focusDays)} />
				</div>

				{yearChartData.length > 0 && (
					<div className="stats-chart-section">
						<h3>{I18n.t('yearlyDistribution')}</h3>
						<BarChart
							data={yearChartData}
							height={250}
							maxBars={10}
							onBarClick={(label) => {
								const year = parseInt(label);
								const newDate = new Date(year, 0, 1);
								setCurrentDate(newDate);
								setViewMode('year');
							}}
						/>
					</div>
				)}
			</div>
		);
	};

	function StatCard(props: { icon: string; label: string; value: string }) {
		const iconRef = React.useRef<HTMLDivElement>(null);

		React.useEffect(() => {
			if (iconRef.current) {
				setIcon(iconRef.current, props.icon);
			}
		}, [props.icon]);

		return (
			<div className="stat-card">
				<div className="stat-icon" ref={iconRef}></div>
				<div className="stat-label">{props.label}</div>
				<div className="stat-value">{props.value}</div>
			</div>
		);
	}

	return (
		<div className="statistics-view">
			<div className="stats-header">
				<h2>{I18n.t('statisticsTitle')}</h2>

				<div className="view-mode-selector">
					<button
						className={`view-mode-button ${viewMode === 'day' ? 'active' : ''}`}
						onClick={() => setViewMode('day')}
					>
						{I18n.t('viewDay')}
					</button>
					<button
						className={`view-mode-button ${viewMode === 'week' ? 'active' : ''}`}
						onClick={() => setViewMode('week')}
					>
						{I18n.t('viewWeek')}
					</button>
					<button
						className={`view-mode-button ${viewMode === 'month' ? 'active' : ''}`}
						onClick={() => setViewMode('month')}
					>
						{I18n.t('viewMonth')}
					</button>
					<button
						className={`view-mode-button ${viewMode === 'year' ? 'active' : ''}`}
						onClick={() => setViewMode('year')}
					>
						{I18n.t('viewYear')}
					</button>
					<button
						className={`view-mode-button ${viewMode === 'total' ? 'active' : ''}`}
						onClick={() => setViewMode('total')}
					>
						{I18n.t('viewTotal')}
					</button>
				</div>

				{viewMode !== 'total' && (
					<DateNavigator
						viewType={viewMode}
						currentDate={currentDate}
						onDateChange={setCurrentDate}
					/>
				)}
			</div>

			{isInitialLoad ? (
				<div className="stats-loading">{I18n.t('loading')}</div>
			) : (
				<div>
					{viewMode === 'day' && renderDayView()}
					{viewMode === 'week' && renderWeekView()}
					{viewMode === 'month' && renderMonthView()}
					{viewMode === 'year' && renderYearView()}
					{viewMode === 'total' && renderTotalView()}
				</div>
			)}
		</div>
	);
}

