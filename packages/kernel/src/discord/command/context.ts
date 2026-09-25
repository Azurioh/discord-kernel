import type { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import type { Options, Values } from "@/discord/command/options";
import { sendEmbed } from "@/discord/command/send-embed";
import { interactionLocale } from "@/discord/interaction/interaction-locale";
import type { Presenter } from "@/discord/presenter";
import type { Locale } from "@/i18n/locale";
import type { TranslationParams, Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";

/**
 * The handler-facing surface of a dispatched subcommand: the raw interaction,
 * the parsed & typed options, the locale resolved for this interaction, a
 * translate helper bound to it, and convenience responders that route through
 * the injected {@link Presenter}.
 */
export interface Context<O extends Options> {
	readonly interaction: ChatInputCommandInteraction;
	readonly options: Values<O>;
	/** Reply language: user's client locale → guild locale → configured default. */
	readonly locale: Locale;
	/** Translate a catalog key for this interaction's locale. */
	t(key: string, params?: TranslationParams): string;
	reply(embed: EmbedBuilder): Promise<void>;
	confirm(message: string): Promise<void>;
	error(message: string): Promise<void>;
	deny(message: string): Promise<void>;
}

export function createContext<O extends Options>(
	interaction: ChatInputCommandInteraction,
	options: Values<O>,
	ephemeral: boolean,
	presenter: Presenter,
	logger: Logger,
	translator: Translator,
): Context<O> {
	const locale = interactionLocale(interaction, translator);
	return {
		interaction,
		options,
		locale,
		t: (key, params) => translator.translate(locale, key, params),
		reply: (embed) => sendEmbed(interaction, embed, ephemeral, logger),
		confirm: (message) =>
			sendEmbed(interaction, presenter.confirmation(message, locale), ephemeral, logger),
		error: (message) => sendEmbed(interaction, presenter.error(message, locale), ephemeral, logger),
		deny: (message) => sendEmbed(interaction, presenter.denial(message, locale), ephemeral, logger),
	};
}
