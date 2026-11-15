import { FileStore } from "./fileStore";
import { dataPath } from "./paths";

interface RegistryEntry {
	path: string;
	createdAt: number;
	updatedAt: number;
}

interface RegistryFile {
	version: 1;
	byPath: Record<string, string>;
	byId: Record<string, RegistryEntry>;
}

function emptyRegistry(): RegistryFile {
	return { version: 1, byPath: {}, byId: {} };
}

function newNoteId(): string {
	return `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Stable note identity independent of path. Paths are hints; ids survive renames.
 */
export class NoteRegistry {
	private readonly path = dataPath("notes.json");
	private data: RegistryFile = emptyRegistry();
	private dirty = false;
	private saveTimer: number | null = null;
	private saveChain: Promise<void> = Promise.resolve();

	constructor(private readonly files: FileStore) {}

	public async load(): Promise<void> {
		const parsed = await this.files.readJson<RegistryFile>(this.path);
		if (parsed && parsed.version === 1 && parsed.byPath && parsed.byId) {
			this.data = parsed;
		} else {
			this.data = emptyRegistry();
		}
		this.dirty = false;
	}

	public ensure(path: string): string {
		const existing = this.data.byPath[path];
		if (existing) {
			return existing;
		}
		const id = newNoteId();
		const now = Date.now();
		this.data.byId[id] = { path, createdAt: now, updatedAt: now };
		this.data.byPath[path] = id;
		this.scheduleSave();
		return id;
	}

	public async importEntries(entries: Array<{ id: string; path: string }>): Promise<void> {
		const now = Date.now();
		for (const entry of entries) {
			if (!entry.id || !entry.path) {
				continue;
			}
			this.data.byId[entry.id] = { path: entry.path, createdAt: now, updatedAt: now };
			this.data.byPath[entry.path] = entry.id;
		}
		this.dirty = true;
		await this.flush();
	}

	public rename(noteId: string, newPath: string): void {
		const entry = this.data.byId[noteId];
		if (!entry) {
			return;
		}
		delete this.data.byPath[entry.path];
		entry.path = newPath;
		entry.updatedAt = Date.now();
		this.data.byPath[newPath] = noteId;
		this.scheduleSave();
	}

	public getPath(noteId: string): string | undefined {
		return this.data.byId[noteId]?.path;
	}

	public getId(path: string): string | undefined {
		return this.data.byPath[path];
	}

	public entries(): Array<{ id: string; path: string }> {
		return Object.keys(this.data.byId).map((id) => ({ id, path: this.data.byId[id].path }));
	}

	public size(): number {
		return Object.keys(this.data.byId).length;
	}

	public async flush(): Promise<void> {
		if (!this.dirty) {
			return;
		}
		if (this.saveTimer !== null) {
			globalThis.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		this.dirty = false;
		this.saveChain = this.saveChain
			.then(() => this.files.writeJson(this.path, this.data))
			.catch((error) => {
				this.dirty = true;
				console.error("[focus-time] Failed to save note registry", error);
			});
		await this.saveChain;
	}

	private scheduleSave(): void {
		this.dirty = true;
		if (this.saveTimer !== null) {
			return;
		}
		this.saveTimer = globalThis.setTimeout(() => {
			this.saveTimer = null;
			void this.flush();
		}, 1000) as unknown as number;
	}
}
