import {TFile} from "obsidian";

export class RecordUtils {
	static generateFileId(file: TFile): string {
		return file.path.concat(file.stat.ctime.toString());
	}
}
