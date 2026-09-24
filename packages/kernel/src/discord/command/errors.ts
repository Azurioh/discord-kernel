import { ValidationError } from "@/errors/business-error";

/**
 * Raised when a slash command option is declared or read in a way discord.js
 * cannot honour (an unsupported `choices` call, a value that fails parsing).
 * A `ValidationError`, so the command pipeline renders it as user feedback
 * rather than an incident.
 */
export class OptionValidationError extends ValidationError {}

/**
 * Raised when a context-menu interaction does not carry the target its command
 * was declared for. Discord routes an interaction to the command it was
 * registered as, so this signals a misregistration rather than user input —
 * hence a plain `Error`, rendered as an incident with a reference.
 */
export class ContextMenuTargetError extends Error {
	constructor(commandName: string, expected: string) {
		super(`Context menu command "${commandName}" expected a ${expected} target.`);
		this.name = "ContextMenuTargetError";
	}
}
