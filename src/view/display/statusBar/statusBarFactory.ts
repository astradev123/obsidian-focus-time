import {StatusBarManager} from "./statusBarManager";
import {TimeUtils} from "../../../util/timeUtils";

export class StatusBarFactory {

    public static createIconTextStatusBar(manager: StatusBarManager, readingTime: number) {
        const formattedReadingTime = TimeUtils.getFormattedReadingTime(readingTime);
        manager.render(formattedReadingTime, "book-open-text");
    }

    public static createTextStatusBar(manager: StatusBarManager, text: string) {
        manager.render(text);
    }

}
