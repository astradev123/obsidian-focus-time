import I18n from "../language/i18n";
import { DateUtils } from "./dateUtils";

export class TimeUtils {

	/**
	 * Get the formatted reading time
	 * @param timeMilliseconds
	 */
	static getFormattedReadingTime(timeMilliseconds: number): string {
		const readMinutes = Math.max(0, timeMilliseconds) / 1000 / 60;
		const hours = Math.floor(readMinutes / 60);
		const minutes = Math.floor(readMinutes % 60);

		if (hours === 0) {
			if (minutes === 0) {
				return I18n.t("time.lessThanOneMinute");
			}
			return I18n.t("time.minutes", {minute: minutes.toFixed(0)});
		}

		return I18n.t("time.hoursMinutes", {hour: hours, minute: minutes.toFixed(0)});
	}

	static formatNumber(value: number): string {
		try {
			return new Intl.NumberFormat(I18n.getInstance().getLanguage()).format(value);
		} catch {
			return String(value);
		}
	}

	/**
	 * Local date in `YYYY-MM-DD` format.
	 */
	static getDateToday() {
		return DateUtils.toLocalDate();
	}
}
