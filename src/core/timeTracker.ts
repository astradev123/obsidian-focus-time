import {App, TFile} from "obsidian";
import {ReadRecord} from "../interface/readRecord";
import {RecordUtils} from "../util/recordUtils";
import {PluginDataManager} from "./pluginDataManager";
import {StatusBarManager} from "../view/display/statusBar/statusBarManager";
import {StatusBarFactory} from "../view/display/statusBar/statusBarFactory";
import {DailyReadDataManager} from "./dailyReadDataManager";
import FocusTimePlugin from "../main";

export class TimeTracker {

	private readonly app: App;
	private currentFile: TFile | null;
	private readonly dataManager: PluginDataManager;
	private readonly statusBarManager: StatusBarManager;
	private readonly dailyReadDataManager: DailyReadDataManager;
	private refreshInterval: number | null = null;
	private globalRefreshTime: number = 1000 * 6;
	private windowFocus: boolean = true;

	constructor(plugin: FocusTimePlugin, app: App, dataManager: PluginDataManager, dailyReadDataManager: DailyReadDataManager) {
		this.app = app;
		this.dataManager = dataManager;
		this.dailyReadDataManager = dailyReadDataManager;
		this.statusBarManager = new StatusBarManager(plugin);
		this.currentFile = null;
		this.app.workspace.on("file-open", () => this.handleFileChange());
		window.addEventListener("focus", () => this.handleWindowFocus());
		window.addEventListener("blur", () => this.handleWindowBlur());
		this.startRefreshTimer();
	}

	/**
	 * Set up the refresh timer
	 */
	private startRefreshTimer() {
		this.refreshInterval = window.setInterval(() => {
			this.refreshAndSave(this.globalRefreshTime);
			this.updateStatusBar();
			//console.log("Refreshed", new Date().toLocaleTimeString());
		}, this.globalRefreshTime);
	}

	/**
	 * Stops the refresh timer
	 */
	public stopRefreshTimer() {
		if (this.refreshInterval !== null) {
			clearInterval(this.refreshInterval);
			this.refreshInterval = null;
		}
	}

	/**
	 * Updates the status bar with the current file's read time
	 */
	private updateStatusBar() {
		if (this.currentFile) {
			const readData = this.getTotalReadData(this.currentFile);

			StatusBarFactory.createIconTextStatusBar(this.statusBarManager, readData?.duration ?? 0);
		} else {
			this.statusBarManager.remove();
		}
	}

	/**
	 * Handles file change event
	 */
	public handleFileChange() {
		const activeFile = this.app.workspace.getActiveFile();

		if (this.currentFile && this.currentFile !== activeFile) {
			//this.refreshAndSave(this.refreshTime);
			this.incTotalReadCount(this.currentFile);
		}

		this.currentFile = activeFile;

		this.updateStatusBar();
	}

	/**
	 * Handles window focus event
	 * @private
	 */
	private handleWindowFocus() {
		this.windowFocus = true;
	}

	/**
	 * Handles window blur event
	 * @private
	 */
	private handleWindowBlur() {
		this.windowFocus = false;
	}

	/**
	 * Refreshes the read time and saves it
	 */
	private refreshAndSave(refreshTime: number) {
		if (!this.currentFile || this.needSuspendTimer()) {
			return;
		}

		const readData = this.getTotalReadData(this.currentFile);

		this.saveDailyReadData(
			this.currentFile,
			readData ? readData.duration + refreshTime : refreshTime,
		);

		this.saveTotalReadData(
			this.currentFile,
			readData ? readData.duration + refreshTime : refreshTime,
			readData ? readData.openCount : 1,
			readData ? readData.firstStartTime : Date.now()
		);
	}

	public saveDailyReadData(
		file: TFile,
		duration: number
	) {
		const readRecord: ReadRecord = this.buildReadData(file, duration, 0, 0, true);
		this.dailyReadDataManager.saveTodayData("dailyReadData", readRecord).finally();
	}

	/**
	 * Saves the read data
	 */
	public saveTotalReadData(
		file: TFile,
		duration: number,
		openCount: number,
		firstStartTime: number
	) {
		const readRecord: ReadRecord = this.buildReadData(file, duration, openCount, firstStartTime, false);
		this.dataManager.put("readData", readRecord.id, readRecord).finally();
	}

	/**
	 * Builds the read data
	 * @param file
	 * @param duration
	 * @param openCount
	 * @param firstStartTime
	 * @param isDailyData Daily read data only need id and duration
	 * @private
	 */
	private buildReadData(file: TFile, duration: number, openCount: number, firstStartTime: number, isDailyData: boolean): ReadRecord {
		if(isDailyData) {
			return {
				filePath: "",
				firstStartTime: 0,
				openCount: 0,
				id: RecordUtils.generateFileId(file),
				duration: duration
			};
		}

		return {
			id: RecordUtils.generateFileId(file),
			filePath: file.path,
			duration: duration,
			openCount: openCount,
			firstStartTime: firstStartTime,
		};
	}


	private incTotalReadCount(file: TFile) {
		const totalReadData = this.getTotalReadData(file);
		const totalRecord = this.buildReadData(
			file,
			totalReadData ? totalReadData.duration : 0,
			totalReadData ? totalReadData.openCount + 1 : 1,
			totalReadData ? totalReadData.firstStartTime : Date.now(),
			false
		);
		this.saveTotalReadData(file, totalRecord.duration, totalRecord.openCount, totalRecord.firstStartTime);
	}
	/**
	 * Gets the read data
	 */
	public getTotalReadData(file: TFile): ReadRecord | undefined {
		return this.dataManager.get("readData", RecordUtils.generateFileId(file));
	}

	/**
	 * Unloads the time tracker
	 */
	public unload() {
		this.stopRefreshTimer();
		this.statusBarManager.remove();
	}

	private isStrictMode() {
		return this.dataManager.get('settings', 'strictMode') ?? true;
	}

	private needSuspendTimer() {
		return this.isStrictMode() && !this.windowFocus;
	}
}
