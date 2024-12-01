export interface ReadRecord {
	/**
	 * File id
	 */
	id: string;

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

	/**
	 * The time the file was first opened
	 */
	firstStartTime: number;
}
