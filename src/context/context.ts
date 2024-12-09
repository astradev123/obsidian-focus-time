import {TFile} from "obsidian";

export class Context {

	private static currentFile: TFile | null = null;

	public static setCurrentFile(filePath: TFile | null): void {
		this.currentFile = filePath;
	}

	public static getCurrentFile(): TFile | null {
		return this.currentFile;
	}
}
