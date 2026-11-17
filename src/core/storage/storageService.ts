import { App } from "obsidian";
import { DailyReadDataManager } from "../dailyReadDataManager";
import { PluginDataManager } from "../pluginDataManager";
import { EventStore, newEventId } from "./eventStore";
import { FileStore } from "./fileStore";
import { FocusIndex } from "./focusIndex";
import { LegacyScan, LegacyVerification, buildLegacyEvents, scanLegacy, summarizeScan, verifyLegacy } from "./legacy";
import { MetaStore } from "./metaStore";
import { NoteRegistry } from "./noteRegistry";
import { archivePath, configureDataRoot, dataPath, eventsPath, legacyDataRootPath, reportsPath } from "./paths";
import { RenameEvent, SessionEvent, SessionInput } from "./types";

export interface MigrationReport {
	ok: boolean;
	reportPath: string;
	backupDir: string;
	importedEvents: number;
	scanned: ReturnType<typeof summarizeScan>;
	verification?: LegacyVerification;
	error?: string;
}

export interface StorageStats {
	schemaVersion: number;
	dataFolder: string;
	events: number;
	sessions: number;
	legacyDays: number;
	notes: number;
	registeredNotes: number;
	unmappedMs: number;
	migratedAt?: number;
	lastLegacyImportAt?: number;
}

/**
 * Facade over the v1 storage: registry, event log, index, and v0 migration.
 */
export class StorageService {
	public readonly files: FileStore;
	public readonly meta: MetaStore;
	public readonly registry: NoteRegistry;
	public readonly events: EventStore;
	public readonly index = new FocusIndex();

	private initialized = false;
	private initPromise: Promise<void> | null = null;
	private lastScan: LegacyScan | null = null;
	private lastLocalWriteAt = 0;
	private lastSeenMtime = 0;
	private readonly listeners = new Set<() => void>();

	constructor(
		private readonly app: App,
		private readonly pluginDir: string,
		private readonly deviceId: string,
		private readonly dataManager: PluginDataManager,
		private readonly dailyManager: DailyReadDataManager
	) {
		configureDataRoot(pluginDir);
		this.files = new FileStore(app);
		this.meta = new MetaStore(this.files);
		this.registry = new NoteRegistry(this.files);
		this.events = new EventStore(this.files, deviceId, `${pluginDir}/wal.${deviceId}.jsonl`);
	}

	public async init(): Promise<void> {
		if (this.initialized) {
			return;
		}
		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this.doInit();
		try {
			await this.initPromise;
			this.initialized = true;
		} finally {
			this.initPromise = null;
		}
	}

	private async doInit(): Promise<void> {
		await this.migrateRootData();
		await this.files.ensureFolder(dataPath());
		await this.files.ensureFolder(eventsPath());
		await this.files.ensureFolder(archivePath());

		await this.registry.load();
		await this.meta.load();

		if (!this.meta.get()) {
			const report = await this.migrate();
			if (!report.ok) {
				console.error("[focus-time] Migration did not verify", report);
			}
		} else {
			await this.importNewLegacy();
		}

		await this.events.archiveConflicts();
		await this.events.publish();
		await this.reloadIndex();
	}

	/**
	 * Older builds wrote focus data to `_focus_time/` at the vault root, which
	 * shows up in the file explorer. Move that folder into the plugin directory.
	 * Copies are only removed after every file has been copied, and a failed
	 * copy is cleaned up so the next start can retry.
	 */
	private async migrateRootData(): Promise<void> {
		const legacy = legacyDataRootPath();
		const target = dataPath();
		if (legacy === target || !(await this.files.exists(legacy))) {
			return;
		}

		const looksLikeData = (await this.files.exists(`${legacy}/meta.json`))
			|| (await this.files.exists(`${legacy}/notes.json`))
			|| (await this.files.exists(`${legacy}/events`));
		if (!looksLikeData) {
			return;
		}

		const targetHasData = (await this.files.exists(`${target}/meta.json`))
			|| (await this.files.exists(`${target}/notes.json`))
			|| (await this.files.exists(`${target}/events`));
		if (!targetHasData) {
			// A real folder rename is atomic and cheap.
			try {
				await this.files.adapter.rename(legacy, target);
				return;
			} catch {
				// Fall through to a recursive copy (some adapters only rename files).
			}
		}

		const targetRoot = targetHasData
			? `${target}/archive/root-import-${Date.now()}`
			: target;
		try {
			const files = await this.files.listTree(legacy);
			for (const file of files) {
				const relative = file.slice(legacy.length + 1);
				await this.files.copy(file, `${targetRoot}/${relative}`);
			}
			await this.files.removeFolder(legacy);
		} catch (error) {
			if (!targetHasData) {
				await this.files.removeFolder(targetRoot);
			}
			console.error("[focus-time] Failed to move root focus data into the plugin folder", error);
		}
	}

	/**
	 * Copy the v0 store into `_focus_time/archive/` before touching anything.
	 */
	public async backupV0(backupDir: string): Promise<{ files: number; dataJson: boolean }> {
		let copied = 0;
		const dataJson = `${this.pluginDir}/data.json`;
		if (await this.files.exists(dataJson)) {
			await this.files.copy(dataJson, `${backupDir}/data.json`);
			copied++;
		}

		const dailyDir = this.dailyManager.getDataDir();
		const dailyFiles = await this.files.listFiles(dailyDir);
		for (const file of dailyFiles) {
			const name = file.split("/").pop();
			if (!name) {
				continue;
			}
			await this.files.copy(file, `${backupDir}/data/${name}`);
			copied++;
		}

		return {files: copied, dataJson: await this.files.exists(`${backupDir}/data.json`)};
	}

	private async migrate(): Promise<MigrationReport> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const backupDir = archivePath(`v0-${timestamp}`);
		const reportPath = reportsPath(`migration-${timestamp}.json`);
		let importedEvents = 0;

		try {
			await this.backupV0(backupDir);
			// Normalize only after the original files have been copied.
			await this.dataManager.normalizeLegacyData(this.app);
			const scanResult = await this.scanAndImport();
			this.lastScan = scanResult.scan;
			importedEvents = scanResult.importedEvents;
			const summary = summarizeScan(scanResult.scan);

			await this.reloadIndex();
			const verification = verifyLegacy(
				scanResult.scan,
				(noteId) => this.index.getNoteTotal(noteId),
				(date) => this.index.getDayTotal(date)
			);

			const report: MigrationReport = {
				ok: verification.ok,
				reportPath,
				backupDir,
				importedEvents,
				scanned: summary,
				verification
			};
			await this.files.writeJson(reportPath, report);

			if (verification.ok) {
				await this.meta.save({
					schemaVersion: 1,
					createdAt: Date.now(),
					migratedAt: Date.now(),
					migration: {
						ok: true,
						migratedAt: Date.now(),
						reportPath,
						importedNotes: scanResult.scan.notes.length,
						importedDays: scanResult.scan.days.length,
						importedEvents,
						totalMs: summary.totalMs,
						unmappedMs: scanResult.scan.unmappedMs,
						residualMs: summary.residualMs
					}
				});
			}
			return report;
		} catch (error) {
			const report: MigrationReport = {
				ok: false,
				reportPath,
				backupDir,
				importedEvents,
				scanned: {notes: 0, days: 0, dailyFiles: 0, totalMs: 0, unmappedMs: 0, residualMs: 0},
				error: error instanceof Error ? error.message : String(error)
			};
			try {
				await this.files.writeJson(reportPath, report);
			} catch {
				// Ignore report write failures.
			}
			return report;
		}
	}

	/**
	 * Scan v0 and append only events that do not exist yet.
	 */
	private async scanAndImport(): Promise<{ scan: LegacyScan; importedEvents: number }> {
		const scan = await scanLegacy(this.dataManager, this.dailyManager);
		await this.registry.importEntries(
			scan.notes.map((note) => ({id: note.id, path: note.path})),
			{preserveExisting: true}
		);

		const candidates = buildLegacyEvents(scan, this.deviceId);
		const existing = await this.events.readAll();
		const existingIds = new Set(existing.map((event) => event.id));
		const toWrite = candidates.filter((event) => !existingIds.has(event.id));

		if (toWrite.length > 0) {
			await this.events.appendBatch(toWrite);
		}
		return {scan, importedEvents: toWrite.length};
	}

	/**
	 * Absorb day files written by an older client after the first migration.
	 */
	public async importNewLegacy(): Promise<number> {
		const meta = this.meta.get();
		if (!meta) {
			return 0;
		}

		const existingIds = new Set((await this.events.readAll()).map((event) => event.id));
		const scan = await scanLegacy(this.dataManager, this.dailyManager);
		this.lastScan = scan;
		await this.registry.importEntries(
			scan.notes.map((note) => ({id: note.id, path: note.path})),
			{preserveExisting: true}
		);

		const candidates = buildLegacyEvents(scan, this.deviceId);
		const toWrite = candidates.filter((event) => !existingIds.has(event.id));
		if (toWrite.length === 0) {
			return 0;
		}

		await this.events.appendBatch(toWrite);
		await this.reloadIndex();
		await this.meta.update({lastLegacyImportAt: Date.now()});
		return toWrite.length;
	}

	public async reloadIndex(): Promise<void> {
		const all = await this.events.readAll();

		// Self-heal a lost registry from paths stored in session events.
		if (this.registry.size() === 0) {
			const entries = new Map<string, string>();
			for (const event of all) {
				const path = (event as { path?: string }).path;
				if (event.type !== "rename" && event.note && path) {
					entries.set(event.note, path);
				}
			}
			if (entries.size > 0) {
				await this.registry.importEntries(Array.from(entries, ([id, path]) => ({id, path})));
			}
		}

		// Replay rename events so a registry that missed its debounced save
		// still follows the latest path.
		const renames = all
			.filter((event): event is RenameEvent => event.type === "rename")
			.sort((a, b) => a.at - b.at);
		let renamed = false;
		for (const event of renames) {
			const current = this.registry.getPath(event.note);
			if (current !== undefined && current !== event.to) {
				this.registry.rename(event.note, event.to);
				renamed = true;
			}
		}
		if (renamed) {
			await this.registry.flush();
		}

		this.index.rebuild(all);
		if (this.lastScan) {
			this.index.addUnmapped(this.lastScan.unmappedMs);
		}
		this.emitChange();
	}

	public async ensureNote(path: string): Promise<string> {
		const noteId = this.registry.ensure(path);
		// Persist immediately for new notes so an event never references an id
		// that is not in the registry yet.
		await this.registry.flush();
		return noteId;
	}

	public onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	public notifyChanged(): void {
		this.emitChange();
	}

	private emitChange(): void {
		for (const listener of Array.from(this.listeners)) {
			try {
				listener();
			} catch (error) {
				console.error("[focus-time] Storage listener failed", error);
			}
		}
	}

	public async needsMigration(): Promise<boolean> {
		return !(await this.files.exists(dataPath("meta.json")));
	}

	/**
	 * Cheap check for events written by another device. Directory mtimes do not
	 * change on append, so stat the shards themselves (a handful of files).
	 */
	public async checkForExternalChanges(): Promise<boolean> {
		const files = await this.files.listFiles(eventsPath());
		let maxMtime = 0;
		for (const path of files) {
			if (!path.endsWith(".jsonl")) {
				continue;
			}
			try {
				const stat = await this.files.adapter.stat(path);
				if (stat && stat.mtime > maxMtime) {
					maxMtime = stat.mtime;
				}
			} catch {
				// Ignore unreadable files.
			}
		}

		if (maxMtime <= this.lastSeenMtime) {
			return false;
		}
		this.lastSeenMtime = maxMtime;
		return maxMtime > this.lastLocalWriteAt + 5000;
	}

	public getPath(noteId: string): string | undefined {
		return this.registry.getPath(noteId);
	}

	public getNoteTotal(noteId: string): number {
		return this.index.getNoteTotal(noteId);
	}

	public getTotalForPath(path: string): number {
		const noteId = this.registry.getId(path);
		return noteId ? this.index.getNoteTotal(noteId) : 0;
	}

	public async recordSession(input: SessionInput): Promise<void> {
		const event: SessionEvent = {
			v: 1,
			id: newEventId("s"),
			dev: this.deviceId,
			at: Date.now(),
			type: "session",
			ses: input.ses,
			note: input.note,
			path: input.path,
			start: input.start,
			end: input.end,
			ms: input.ms,
			kind: input.kind,
			idle: input.idle,
			tz: Intl.DateTimeFormat().resolvedOptions().timeZone
		};

		await this.events.record(event);
		this.index.add(event);
		this.lastLocalWriteAt = Date.now();
		this.emitChange();
	}

	public async handleRename(oldPath: string, newPath: string): Promise<void> {
		if (oldPath === newPath) {
			return;
		}
		const noteId = this.registry.getId(oldPath);
		if (!noteId) {
			return;
		}
		this.registry.rename(noteId, newPath);
		this.emitChange();
		try {
			await this.events.record({
				v: 1,
				id: newEventId("r"),
				dev: this.deviceId,
				at: Date.now(),
				type: "rename",
				note: noteId,
				from: oldPath,
				to: newPath
			});
		} catch (error) {
			console.error("[focus-time] Failed to record rename event", error);
		}
	}

	public async handleFolderRename(oldPrefix: string, newPrefix: string): Promise<void> {
		const fromPrefix = oldPrefix.endsWith("/") ? oldPrefix.slice(0, -1) : oldPrefix;
		const toPrefix = newPrefix.endsWith("/") ? newPrefix.slice(0, -1) : newPrefix;
		const prefix = `${fromPrefix}/`;
		const changes: Array<{noteId: string; from: string; to: string}> = [];

		// Update every path synchronously before any await so a tracker flush
		// during a large folder move never creates a second id for a moved note.
		for (const entry of this.registry.entries()) {
			if (!entry.path.startsWith(prefix)) {
				continue;
			}
			const nextPath = `${toPrefix}/${entry.path.slice(prefix.length)}`;
			this.registry.rename(entry.id, nextPath);
			changes.push({noteId: entry.id, from: entry.path, to: nextPath});
		}

		if (changes.length === 0) {
			return;
		}
		this.emitChange();
		for (const change of changes) {
			try {
				await this.events.record({
					v: 1,
					id: newEventId("r"),
					dev: this.deviceId,
					at: Date.now(),
					type: "rename",
					note: change.noteId,
					from: change.from,
					to: change.to
				});
			} catch (error) {
				console.error("[focus-time] Failed to record folder rename event", error);
			}
		}
	}

	public async flush(): Promise<void> {
		try {
			await this.registry.flush();
			await this.events.publish();
			this.lastLocalWriteAt = Date.now();
		} catch (error) {
			console.error("[focus-time] Failed to publish focus events", error);
		}
	}

	public async retryMigrationIfNeeded(): Promise<MigrationReport | null> {
		if (this.meta.get()) {
			return null;
		}
		const report = await this.migrate();
		await this.reloadIndex();
		return report;
	}

	public getStats(): StorageStats {
		const stats = this.index.getStats();
		return {
			schemaVersion: this.meta.get()?.schemaVersion ?? 0,
			dataFolder: dataPath(),
			events: stats.events,
			sessions: stats.sessions,
			legacyDays: stats.legacyDays,
			notes: stats.notes,
			registeredNotes: this.registry.size(),
			unmappedMs: this.lastScan?.unmappedMs ?? 0,
			migratedAt: this.meta.get()?.migratedAt,
			lastLegacyImportAt: this.meta.get()?.lastLegacyImportAt
		};
	}
}
