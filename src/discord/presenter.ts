import type { EmbedBuilder } from "discord.js";
import type { Locale } from "@/i18n";

/**
 * Port that renders framework-level responses (errors, denials, confirmations)
 * as embeds. The command pipeline depends on this interface, never on a concrete
 * embed module — so a bot can fully restyle/localise feedback by providing its
 * own implementation, with zero changes to the core.
 *
 * Every method receives the locale resolved for the interaction being answered,
 * so titles and fixed copy follow the user's language, not the process's.
 *
 * The default implementation lives in `infrastructure/discord/default-presenter.ts`.
 */
export interface Presenter {
	/** A successful, affirmative action. */
	confirmation(message: string, locale: Locale): EmbedBuilder;
	/** A benign business problem (bad input, missing resource, conflict). */
	warning(message: string, locale: Locale): EmbedBuilder;
	/** A serious—but expected—business error. */
	error(message: string, locale: Locale): EmbedBuilder;
	/** An authorization denial from a guard. */
	denial(message: string, locale: Locale): EmbedBuilder;
	/** An unexpected failure, carrying a quotable incident reference. */
	systemError(message: string, reference: string, locale: Locale): EmbedBuilder;
}
