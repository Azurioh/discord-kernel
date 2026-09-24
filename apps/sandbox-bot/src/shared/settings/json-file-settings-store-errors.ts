/** Thrown when the settings file holds something other than a JSON object of records. */
export class CorruptSettingsFileError extends Error {
	constructor(filePath: string) {
		super(`Settings file ${filePath} does not hold a JSON object of records`);
		this.name = "CorruptSettingsFileError";
	}
}
