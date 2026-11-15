import { StatusBarManager } from "./statusBarManager";
import { TimeUtils } from "../../../util/timeUtils";
import I18n from "../../../language/i18n";
import { PauseReason } from "../../../core/tracking/types";

export class StatusBarFactory {

    public static createIconTextStatusBar(
        manager: StatusBarManager,
        readingTime: number,
        reason: PauseReason | null = null,
        idleMinutes = 5
    ) {
        const formattedReadingTime = TimeUtils.getFormattedReadingTime(readingTime);

        if (!reason) {
            manager.render(formattedReadingTime, "book-open-text", I18n.t("status.focusing"));
            return;
        }

        const shortLabel = I18n.t(`status.short.${reason}`);
        const title = reason === "idle"
            ? I18n.t("status.pausedIdle", { minute: idleMinutes })
            : reason === "blur"
                ? I18n.t("status.pausedBlur")
                : I18n.t("status.pausedManual");

        manager.render(`${formattedReadingTime} · ${shortLabel}`, "pause", title);
    }

    public static createTextStatusBar(manager: StatusBarManager, text: string) {
        manager.render(text);
    }

}
