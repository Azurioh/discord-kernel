import type { CommandInteraction } from "discord.js";
import { sendEmbed } from "@/discord/command/send-embed";
import type { Presenter } from "@/discord/presenter";
import type { Locale } from "@/i18n/locale";
import type { TranslationParams, Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";

/**
 * What every command handler's context offers, whatever kind of command it
 * serves: the reply language, a translate helper bound to it, and responders
 * that route through the injected {@link Presenter}.
 */
export interface CommandResponders {
	/** Reply language: user's client locale → guild locale → configured default. */
	readonly locale: Locale;
	/** Translate a catalog key for this interaction's locale. */
	t(key: string, params?: TranslationParams): string;
	confirm(message: string): Promise<void>;
	error(message: string): Promise<void>;
	deny(message: string): Promise<void>;
}

/** Bind the shared responders to one interaction, its locale and its visibility. */
export function createCommandResponders(
	interaction: CommandInteraction,
	locale: Locale,
	ephemeral: boolean,
	deps: { readonly presenter: Presenter; readonly logger: Logger; readonly translator: Translator },
): CommandResponders {
	const { presenter, logger, translator } = deps;
	return {
		locale,
		t: (key, params) => translator.translate(locale, key, params),
		confirm: (message) =>
			sendEmbed(interaction, presenter.confirmation(message, locale), ephemeral, logger),
		error: (message) => sendEmbed(interaction, presenter.error(message, locale), ephemeral, logger),
		deny: (message) => sendEmbed(interaction, presenter.denial(message, locale), ephemeral, logger),
	};
}
