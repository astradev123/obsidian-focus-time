import { FileStore } from "./fileStore";
import { dataPath } from "./paths";

export interface MigrationSummary {
	ok: boolean;
	migratedAt: number;
	reportPath: string;
	importedNotes: number;
	importedDays: number;
	importedEvents: number;
	totalMs: number;
	unmappedMs: number;
	residualMs: number;
}

export interface FocusMeta {
	schemaVersion: 1;
	createdAt: number;
	migratedAt?: number;
	lastLegacyImportAt?: number;
	migration?: MigrationSummary;
}

export class MetaStore {
	private readonly path = dataPath("meta.json");
	private value: FocusMeta | null = null;

	constructor(private readonly files: FileStore) {}

	public async load(): Promise<FocusMeta | null> {
		const parsed = await this.files.readJson<FocusMeta>(this.path);
		this.value = parsed && parsed.schemaVersion === 1 ? parsed : null;
		return this.value;
	}

	public get(): FocusMeta | null {
		return this.value;
	}

	public async save(meta: FocusMeta): Promise<void> {
		this.value = meta;
		await this.files.writeJson(this.path, meta);
	}

	public async update(patch: Partial<FocusMeta>): Promise<void> {
		if (!this.value) {
			return;
		}
		this.value = { ...this.value, ...patch };
		await this.files.writeJson(this.path, this.value);
	}
}
