import type { SettingsDeclaration } from "@/settings/define-settings";

/** Whether a module can run on a guild: what an administrator still has to set. */
export interface SettingsStatus {
	/** Keys of the required fields without default the guild left unset, in declared order. */
	readonly missing: readonly string[];
}

/**
 * The configuration status of a module's values on one guild (FR-040). A
 * required field with a default always has a value, so it is never missing.
 *
 * @param declaration - the module's settings declaration.
 * @param values - the guild's values as the service reads them: an unset (or
 * invalid) field is `undefined` unless it has a default.
 */
export function settingsStatus(
	declaration: SettingsDeclaration,
	values: Readonly<Record<string, unknown>>,
): SettingsStatus {
	const missing = Object.entries(declaration.fields)
		.filter(([key, declared]) => declared.required && values[key] === undefined)
		.map(([key]) => key);
	return { missing };
}
