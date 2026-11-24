import I18n from "../../language/i18n";
import { DateUtils } from "../../util/dateUtils";
import { TimeUtils } from "../../util/timeUtils";
import { getRangeStats } from "../../analytics/metrics";
import { Period, getRange } from "../../analytics/period";
import { FileStore } from "../storage/fileStore";
import { exportsPath } from "../storage/paths";
import { StorageService } from "../storage/storageService";
import { SessionEvent } from "../storage/types";

function pad(value: number): string {
	return value < 10 ? `0${value}` : String(value);
}

function localTime(ms: number): string {
	const date = new Date(ms);
	return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function csvCell(value: string | number): string {
	const text = String(value);
	return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function stamp(): string {
	const date = new Date();
	return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export class Exporter {
	constructor(
		private readonly storage: StorageService,
		private readonly files: FileStore
	) {}

	public async exportCsv(): Promise<string> {
		const events = (await this.storage.events.readAll()).filter(
			(event): event is SessionEvent => event.type === "session"
		);
		const rows: string[] = ["date,start,end,duration_min,note,kind,device,id"];
		for (const event of events) {
			rows.push([
				DateUtils.toLocalDateFromMs(event.start),
				localTime(event.start),
				localTime(event.end),
				(event.ms / 60_000).toFixed(1),
				csvCell(this.storage.getPath(event.note) ?? event.path),
				event.kind,
				csvCell(event.dev),
				csvCell(event.id)
			].join(","));
		}
		return this.write(`focus-sessions-${stamp()}.csv`, rows.join("\n") + "\n");
	}

	public async exportJson(): Promise<string> {
		const events = await this.storage.events.readAll();
		const payload = {
			schemaVersion: 1,
			exportedAt: new Date().toISOString(),
			notes: this.storage.registry.entries(),
			events
		};
		return this.write(`focus-data-${stamp()}.json`, JSON.stringify(payload, null, 2));
	}

	public async exportMarkdown(period: Period = "week", anchor: Date = new Date()): Promise<string> {
		const range = getRange(period, anchor);
		const stats = getRangeStats(this.storage.index, range, (noteId) => this.storage.getPath(noteId));
		const top = Array.from(stats.noteTotals.entries())
			.map(([noteId, ms]) => ({path: this.storage.getPath(noteId) ?? noteId, ms}))
			.sort((a, b) => b.ms - a.ms)
			.slice(0, 10);

		const lines = [
			`# ${I18n.t("export.title")}`,
			"",
			`- ${I18n.t("export.range")}: ${range.from} — ${range.to}`,
			`- ${I18n.t("export.total")}: ${TimeUtils.getFormattedReadingTime(stats.totalMs)}`,
			`- ${I18n.t("export.sessions")}: ${stats.sessionCount}`,
			`- ${I18n.t("export.avgSession")}: ${TimeUtils.getFormattedReadingTime(stats.avgSessionMs)}`,
			`- ${I18n.t("export.deepWork")}: ${Math.round(stats.deepWorkRatio * 100)}%`,
			"",
			`## ${I18n.t("export.topNotes")}`,
			"",
			`| ${I18n.t("export.note")} | ${I18n.t("export.time")} |`,
			"| --- | --- |"
		];

		if (top.length === 0) {
			lines.push(`| ${I18n.t("export.noData")} | — |`);
		} else {
			for (const item of top) {
				lines.push(`| ${item.path.replace(/\|/g, "\\|")} | ${TimeUtils.getFormattedReadingTime(item.ms)} |`);
			}
		}

		lines.push("", `_${I18n.t("export.generatedAt")}: ${new Date().toLocaleString(I18n.getInstance().getLanguage())}_`);
		return this.write(`focus-report-${stamp()}.md`, lines.join("\n") + "\n");
	}

	private async write(name: string, content: string): Promise<string> {
		const path = exportsPath(name);
		await this.files.write(path, content);
		return path;
	}
}
