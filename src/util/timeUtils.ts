import I18n from "../language/i18n";

export class TimeUtils {

	/**
	 * Get the formatted reading time
	 * @param timeMilliseconds
	 */
	static getFormattedReadingTime(timeMilliseconds: number): string {

		const readMinutes = timeMilliseconds / 1000 / 60;
		const hours = Math.floor(readMinutes / 60);
		const minutes = (readMinutes % 60).toFixed(0);

		if (hours === 0) {
			return I18n.t("minutes", {minute: minutes});
		}

		return I18n.t("hours_minutes", {hour: hours, minute: minutes});
	}

	/**
	 * Returns the current date in the format of YYYY-MM-DD
	 */
	static getDateToday() {
		const today = new Date();
		const year = today.getFullYear();
		const month = today.getMonth() + 1;
		const day = today.getDate();
		return `${year}-${month}-${day}`;
	}
}
