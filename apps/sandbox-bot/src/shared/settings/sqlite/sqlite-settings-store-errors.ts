/** Thrown when a `module_settings` row does not hold a settings record the store can read. */
export class CorruptSettingsRowError extends Error {
	constructor(guildId: string, moduleId: string) {
		super(`The SQLite settings row of module "${moduleId}" in guild ${guildId} is corrupt`);
		this.name = "CorruptSettingsRowError";
	}
}
