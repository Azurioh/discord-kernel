import type { LocalizationMap } from "discord.js";

/**
 * The single discord.js locale code for French, mapped to the given text. This
 * bot's commands, subcommands and options default to English, so this is what
 * adds the French translation without repeating `{ fr: ... }` at every call
 * site.
 */
export function frenchLocalization(text: string): LocalizationMap {
	return { fr: text };
}
