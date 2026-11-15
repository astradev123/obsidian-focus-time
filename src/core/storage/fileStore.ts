import { App } from "obsidian";

function dirname(path: string): string {
	const index = path.lastIndexOf("/");
	return index > 0 ? path.slice(0, index) : "";
}

/**
 * Thin, exception-tolerant wrapper around the vault adapter.
 */
export class FileStore {
	constructor(private readonly app: App) {}

	public get adapter() {
		return this.app.vault.adapter;
	}

	public async exists(path: string): Promise<boolean> {
		try {
			return await this.adapter.exists(path);
		} catch {
			return false;
		}
	}

	public async ensureFolder(path: string): Promise<void> {
		if (!path || (await this.exists(path))) {
			return;
		}
		try {
			await this.adapter.mkdir(path);
		} catch {
			// Another writer may have created it.
		}
	}

	public async read(path: string): Promise<string> {
		return this.adapter.read(path);
	}

	public async readOrEmpty(path: string): Promise<string> {
		try {
			return await this.adapter.read(path);
		} catch {
			return "";
		}
	}

	public async write(path: string, content: string): Promise<void> {
		const parent = dirname(path);
		if (parent) {
			await this.ensureFolder(parent);
		}
		await this.adapter.write(path, content);
	}

	public async append(path: string, content: string): Promise<void> {
		const parent = dirname(path);
		if (parent) {
			await this.ensureFolder(parent);
		}
		if (!(await this.exists(path))) {
			await this.adapter.write(path, content);
			return;
		}
		await this.adapter.append(path, content);
	}

	public async readJson<T>(path: string): Promise<T | null> {
		const content = await this.readOrEmpty(path);
		if (!content.trim()) {
			return null;
		}
		try {
			return JSON.parse(content) as T;
		} catch {
			return null;
		}
	}

	public async writeJson(path: string, value: unknown): Promise<void> {
		const content = JSON.stringify(value, null, 2);
		if ((await this.exists(path)) && typeof this.adapter.process === "function") {
			await this.adapter.process(path, () => content);
			return;
		}
		await this.write(path, content);
	}

	public async listFiles(path: string): Promise<string[]> {
		try {
			const listing = await this.adapter.list(path);
			return listing.files;
		} catch {
			return [];
		}
	}

	public async copy(from: string, to: string): Promise<void> {
		const parent = dirname(to);
		if (parent) {
			await this.ensureFolder(parent);
		}
		await this.adapter.copy(from, to);
	}

	public async move(from: string, to: string): Promise<void> {
		const parent = dirname(to);
		if (parent) {
			await this.ensureFolder(parent);
		}
		await this.adapter.rename(from, to);
	}

	public async remove(path: string): Promise<void> {
		try {
			await this.adapter.remove(path);
		} catch {
			// Already gone.
		}
	}
}
