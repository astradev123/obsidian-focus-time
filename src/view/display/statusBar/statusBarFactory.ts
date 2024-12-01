import {StatusBarManager} from "./statusBarManager";
import {TimeUtils} from "../../../util/timeUtils";
import {IconTextDisplay} from "./iconTextDisplay";

export class StatusBarFactory {

	public static createIconTextStatusBar(manager: StatusBarManager, readingTime: number) {
		const formattedReadingTime = TimeUtils.getFormattedReadingTime(readingTime);
		manager.display(
			new IconTextDisplay(),
			formattedReadingTime,
			"book-open-text",
		);
	}

	public static createTextStatusBar(manager: StatusBarManager, text: string) {
		manager.display(
			new IconTextDisplay(),
			text
		);
	}

}
