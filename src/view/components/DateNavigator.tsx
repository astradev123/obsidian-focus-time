import I18n from "../../language/i18n";

interface DateNavigatorProps {
	viewType: 'day' | 'month' | 'year';
	currentDate: Date;
	onDateChange: (date: Date) => void;
}

export function DateNavigator(props: DateNavigatorProps) {
	const { viewType, currentDate, onDateChange } = props;

	const handlePrevious = () => {
		const newDate = new Date(currentDate);
		if (viewType === 'day') {
			newDate.setDate(newDate.getDate() - 1);
		} else if (viewType === 'month') {
			newDate.setMonth(newDate.getMonth() - 1);
		} else if (viewType === 'year') {
			newDate.setFullYear(newDate.getFullYear() - 1);
		}
		onDateChange(newDate);
	};

	const handleNext = () => {
		const newDate = new Date(currentDate);
		const today = new Date();
		
		if (viewType === 'day') {
			newDate.setDate(newDate.getDate() + 1);
			// Don't allow going into the future
			if (newDate > today) {
				return;
			}
		} else if (viewType === 'month') {
			newDate.setMonth(newDate.getMonth() + 1);
			const nextMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
			if (nextMonthStart > today) {
				return;
			}
		} else if (viewType === 'year') {
			newDate.setFullYear(newDate.getFullYear() + 1);
			const nextYearStart = new Date(currentDate.getFullYear() + 1, 0, 1);
			if (nextYearStart > today) {
				return;
			}
		}
		onDateChange(newDate);
	};

	const handleToday = () => {
		onDateChange(new Date());
	};

	const formatDate = () => {
		if (viewType === 'day') {
			return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
		} else if (viewType === 'month') {
			return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
		} else if (viewType === 'year') {
			return `${currentDate.getFullYear()}`;
		}
	};

	const isToday = () => {
		const today = new Date();
		if (viewType === 'day') {
			return currentDate.toDateString() === today.toDateString();
		} else if (viewType === 'month') {
			return currentDate.getFullYear() === today.getFullYear() && 
				   currentDate.getMonth() === today.getMonth();
		} else if (viewType === 'year') {
			return currentDate.getFullYear() === today.getFullYear();
		}
		return false;
	};

	const canGoNext = () => {
		const today = new Date();
		today.setHours(0, 0, 0, 0); // Reset to start of day
		
		if (viewType === 'day') {
			const tomorrow = new Date(currentDate);
			tomorrow.setDate(tomorrow.getDate() + 1);
			tomorrow.setHours(0, 0, 0, 0);
			return tomorrow <= today;
		} else if (viewType === 'month') {
			const todayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
			const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
			return nextMonth <= todayMonth;
		} else if (viewType === 'year') {
			const todayYear = today.getFullYear();
			const nextYear = currentDate.getFullYear() + 1;
			return nextYear <= todayYear;
		}
		return false;
	};

	return (
		<div className="date-navigator">
			<button 
				className="date-nav-button"
				onClick={handlePrevious}
				aria-label={I18n.t('datePrevious')}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<polyline points="15 18 9 12 15 6"></polyline>
				</svg>
			</button>
			
			<div className="date-display">
				<span className="date-text">{formatDate()}</span>
			</div>

			<button 
				className="date-nav-button"
				onClick={handleNext}
				disabled={!canGoNext()}
				aria-label={I18n.t('dateNext')}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<polyline points="9 18 15 12 9 6"></polyline>
				</svg>
			</button>

			{!isToday() && (
				<button 
					className="date-today-button"
					onClick={handleToday}
				>
					{I18n.t('today')}
				</button>
			)}
		</div>
	);
}

