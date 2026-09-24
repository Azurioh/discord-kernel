import { type ErrorTranslation, ValidationError } from "@/errors/business-error";

/** Why one submitted settings value was rejected. */
export type SettingsIssueCode =
	| "required"
	| "type"
	| "min"
	| "max"
	| "minLength"
	| "maxLength"
	| "minItems"
	| "maxItems"
	| "duplicate"
	| "channelType"
	| "notFound"
	| "unknownChoice"
	| "unknownField";

/**
 * One rejected value of a settings submission. `field` is the field key, a
 * `key[index]` path for a list item (e.g. `pingRoles[2]`), or a `key.name` path
 * for a toggle (e.g. `modules.music`); `translation` points at the settings
 * catalog so every surface shows the same wording for the same failure.
 */
export interface SettingsIssue {
	readonly field: string;
	readonly code: SettingsIssueCode;
	readonly translation: ErrorTranslation;
}

/**
 * A settings submission failed validation. Carries every issue at once, so a
 * surface can flag all faulty fields in one round trip; nothing was stored.
 */
export class SettingsValidationError extends ValidationError {
	constructor(readonly issues: readonly SettingsIssue[]) {
		super(
			`Invalid settings: ${issues.map((issue) => `${issue.field} (${issue.code})`).join(", ")}`,
		);
	}
}
