import { type ChatInputCommandInteraction, type EmbedBuilder, MessageFlags } from "discord.js";
import type { Options, Values } from "@/discord/command/options";
import type { Presenter } from "@/discord/presenter";
import { type Locale, resolveLocale, type TranslationParams, type Translator } from "@/i18n";
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

/**
 * Deliver an embed regardless of the interaction's lifecycle state, and never
 * throw: a failed delivery (e.g. an expired/unknown interaction, code 10062)
 * must not escape a handler and reach the client's unhandled `error` event,
 * which would crash the process. Visibility on a deferred interaction is fixed
 * at deferReply time, so editReply carries no flags.
 */
export async function sendEmbed(
	interaction: ChatInputCommandInteraction,
	embed: EmbedBuilder,
	ephemeral: boolean,
	logger: Logger,
): Promise<void> {
	const flags = ephemeral ? MessageFlags.Ephemeral : undefined;
	try {
		if (interaction.deferred) {
			await interaction.editReply({ embeds: [embed] });
			return;
		}
		if (interaction.replied) {
			await interaction.followUp({ embeds: [embed], flags });
			return;
		}
		await interaction.reply({ embeds: [embed], flags });
	} catch (error) {
		logger.error(
			{
				commandName: interaction.commandName,
				interactionId: interaction.id,
				err: error instanceof Error ? error.message : String(error),
			},
			"Failed to deliver interaction response",
		);
	}
}

export function createContext<O extends Options>(
	interaction: ChatInputCommandInteraction,
	options: Values<O>,
	ephemeral: boolean,
	presenter: Presenter,
	logger: Logger,
	translator: Translator,
): Context<O> {
	const locale = resolveLocale(
		[interaction.locale, interaction.guildLocale],
		translator.defaultLocale,
	);
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
