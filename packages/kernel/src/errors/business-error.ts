export type ErrorSeverity = "warning" | "error";

/**
 * Optional catalog reference carried by a {@link BusinessError}. When present,
 * the command pipeline renders the translated text for the interaction's
 * locale; `message` stays the English source used for logs and as fallback.
 * Declared structurally (not imported from `core/i18n`'s `LocalizedText`) to
 * keep this file a pure error declaration; the shapes are checked compatible
 * where the pipeline resolves it.
 */
export interface ErrorTranslation {
	readonly key: string;
	readonly params?: Readonly<Record<string, string | number>>;
}

/**
 * Base class for expected, user-facing errors. Anything that is NOT a
 * {@link BusinessError} is treated as unexpected: it is logged with an incident
 * reference and the user sees a generic message.
 */
export abstract class BusinessError extends Error {
	abstract readonly severity: ErrorSeverity;

	constructor(
		message: string,
		readonly translation?: ErrorTranslation,
	) {
		super(message);
	}
}

/** Benign business error (invalid input, missing resource, conflict). */
export class WarningError extends BusinessError {
	override readonly severity = "warning" as const;
}

/** Serious business error that still carries a user-facing message. */
export class CriticalError extends BusinessError {
	override readonly severity = "error" as const;
}

/** The referenced resource does not exist. */
export class NotFoundError extends WarningError {}

/** User input failed validation. */
export class ValidationError extends WarningError {}

/** The action conflicts with the current state (e.g. a duplicate). */
export class ConflictError extends WarningError {}
