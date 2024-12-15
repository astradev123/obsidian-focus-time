export interface ReadRecord {
	/**
	 * File id
	 */
	fileId: string;

	/**
	 * File name
	 */
	filePath: string;

	/**
	 * Duration in milliseconds
	 */
	duration: number;

	/**
	 * Number of times the file was opened
	 */
	openCount: number;
}
