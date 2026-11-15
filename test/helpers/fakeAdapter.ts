/**
 * In-memory DataAdapter used by storage tests.
 */
export class FakeAdapter {
	files = new Map<string, string>();
	dirs = new Set<string>();
	mtimes = new Map<string, number>();
	private clock = 1;

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.dirs.has(path);
	}

	async read(path: string): Promise<string> {
		const value = this.files.get(path);
		if (value === undefined) {
			throw new Error(`ENOENT: ${path}`);
		}
		return value;
	}

	async write(path: string, data: string): Promise<void> {
		this.files.set(path, data);
		this.touch(path);
	}

	async append(path: string, data: string): Promise<void> {
		this.files.set(path, (this.files.get(path) ?? "") + data);
		this.touch(path);
	}

	async process(path: string, update: (data: string) => string): Promise<string> {
		const next = update(this.files.get(path) ?? "");
		this.files.set(path, next);
		this.touch(path);
		return next;
	}

	async mkdir(path: string): Promise<void> {
		this.dirs.add(path);
	}

	async list(path: string): Promise<{ files: string[]; folders: string[] }> {
		const prefix = path.endsWith("/") ? path : `${path}/`;
		const files = Array.from(this.files.keys()).filter(
			(file) => file.startsWith(prefix) && !file.slice(prefix.length).includes("/")
		);
		const folders = Array.from(this.dirs).filter(
			(dir) => dir.startsWith(prefix) && dir !== path && !dir.slice(prefix.length).includes("/")
		);
		return {files, folders};
	}

	async stat(path: string) {
		if (!this.files.has(path) && !this.dirs.has(path)) {
			throw new Error(`ENOENT: ${path}`);
		}
		return {
			type: this.dirs.has(path) ? "folder" : "file",
			ctime: 0,
			mtime: this.mtimes.get(path) ?? 0,
			size: this.files.get(path)?.length ?? 0
		};
	}

	async copy(from: string, to: string): Promise<void> {
		const value = this.files.get(from);
		if (value === undefined) {
			throw new Error(`ENOENT: ${from}`);
		}
		this.files.set(to, value);
		this.touch(to);
	}

	async rename(from: string, to: string): Promise<void> {
		const value = this.files.get(from);
		if (value === undefined) {
			throw new Error(`ENOENT: ${from}`);
		}
		this.files.delete(from);
		this.files.set(to, value);
		this.touch(to);
	}

	async remove(path: string): Promise<void> {
		this.files.delete(path);
		this.dirs.delete(path);
	}

	private touch(path: string): void {
		this.mtimes.set(path, this.clock++);
	}
}

export function createFakeApp(adapter: FakeAdapter) {
	return {
		vault: {
			adapter,
			configDir: ".obsidian",
			getName: () => "TestVault"
		}
	};
}
