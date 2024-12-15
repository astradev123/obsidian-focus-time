import {App, TFile} from "obsidian";
import {ReadRecord} from "../interface/readRecord";
import {RecordUtils} from "../util/recordUtils";
import {PluginDataManager} from "./pluginDataManager";
import {StatusBarManager} from "../view/display/statusBar/statusBarManager";
import {StatusBarFactory} from "../view/display/statusBar/statusBarFactory";
import {DailyReadDataManager} from "./dailyReadDataManager";
import FocusTimePlugin from "../main";
import {Context} from "../context/context";

export class TimeTracker {

	private readonly app: App;
	private readonly dataManager: PluginDataManager;
	private readonly statusBarManager: StatusBarManager;
	private readonly dailyReadDataManager: DailyReadDataManager;
	private globalRefreshTime: number = 1000 * 1;
	private windowFocus: boolean = true;

	constructor(plugin: FocusTimePlugin, app: App, dataManager: PluginDataManager, dailyReadDataManager: DailyReadDataManager) {
		this.app = app;
		this.dataManager = dataManager;
		this.dailyReadDataManager = dailyReadDataManager;
		this.statusBarManager = new StatusBarManager(plugin);

		plugin.registerEvent(this.app.workspace.on("file-open", () => this.handleFileChange()));
		plugin.registerInterval(window.setInterval(() => this.handleRefresh(), this.globalRefreshTime));

		window.addEventListener("focus", () => this.handleWindowFocus());
		window.addEventListener("blur", () => this.handleWindowBlur());
	}

	/**
	 * Set up the refresh timer
	 */
	private handleRefresh() {
		this.refreshAndSave(this.globalRefreshTime);
		this.updateStatusBar();
	}

	/**
	 * Updates the status bar with the current file's read time
	 */
	private updateStatusBar() {
		const currentFile = Context.getCurrentFile();

		if (currentFile) {
			const readData = this.getTotalReadData(currentFile);
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

		const currentFile = Context.getCurrentFile();

		if (currentFile && currentFile !== activeFile) {
			this.incTotalReadCount(currentFile);
		}

		Context.setCurrentFile(activeFile);

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
		const currentFile = Context.getCurrentFile();

		if (!currentFile || this.needSuspendTimer()) {
			return;
		}

		this.dailyReadDataManager.loadTodayData().then(data => {
			const todayReadData = data["dailyReadData"]? data["dailyReadData"][this.getFileId(currentFile.path)] : undefined;
			this.saveDailyReadData(currentFile, todayReadData ? todayReadData.duration + refreshTime : refreshTime);
		});

		const totalReadData = this.getTotalReadData(currentFile);
		this.saveTotalReadData(
			currentFile,
			totalReadData ? totalReadData.duration + refreshTime : refreshTime,
			totalReadData ? totalReadData.openCount : 1
		);
	}

	public saveDailyReadData(
		file: TFile,
		duration: number
	) {
		const readRecord: ReadRecord = this.buildReadData(file, duration, 0, true);
		this.dailyReadDataManager.saveTodayData("dailyReadData", readRecord).finally();
	}

	/**
	 * Saves the read data
	 */
	public saveTotalReadData(
		file: TFile,
		duration: number,
		openCount: number
	) {
		const readRecord: ReadRecord = this.buildReadData(file, duration, openCount, false);
		this.dataManager.put("readData", readRecord.filePath, readRecord).finally();
	}

	/**
	 * Builds the read data
	 * @param file
	 * @param duration
	 * @param openCount
	 * @param isDailyData Daily read data only need id and duration
	 * @private
	 */
	private buildReadData(file: TFile, duration: number, openCount: number, isDailyData: boolean): ReadRecord {
		if(isDailyData) {
			return {
				filePath: "",
				openCount: 0,
				fileId: this.getFileId(file.path),
				duration: duration
			};
		}

		return {
			fileId: this.getOrCreateFileId(file.path),
			filePath: file.path,
			duration: duration,
			openCount: openCount
		};
	}

	private getOrCreateFileId(filePath: string) {
		const readData = this.dataManager.get("readData", filePath);
		if (readData && readData.fileId) {
			return readData.fileId;
		}

		return Date.now().toString();
	}

	private getFileId(filePath: string) {
		const readData = this.dataManager.get("readData", filePath);
		if (readData && readData.fileId) {
			return readData.fileId;
		}

		return undefined;
	}


	private incTotalReadCount(file: TFile) {
		const totalReadData = this.getTotalReadData(file);
		const totalRecord = this.buildReadData(
			file,
			totalReadData ? totalReadData.duration : 0,
			totalReadData ? totalReadData.openCount + 1 : 1,
			false
		);
		this.saveTotalReadData(file, totalRecord.duration, totalRecord.openCount);
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
		this.statusBarManager.remove();
	}

	private isStrictMode() {
		return this.dataManager.get('settings', 'strictMode') ?? true;
	}

	private needSuspendTimer() {
		return this.isStrictMode() && !this.windowFocus;
	}
}
