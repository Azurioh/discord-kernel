/**
 * A module's settings declaration breaks a rule that can be checked without a
 * guild: a default failing its own field, a secret with a default, too many
 * choices, a duplicate id, a catalog key with no English source… Raised by
 * `defineSettings` and `createSettingsRegistry` at boot, so a broken
 * declaration never reaches a server.
 */
export class SettingsDeclarationError extends Error {
	constructor(
		readonly declarationId: string,
		readonly reason: string,
	) {
		super(`Settings declaration "${declarationId}": ${reason}`);
		this.name = "SettingsDeclarationError";
	}
}
