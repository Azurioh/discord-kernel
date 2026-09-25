import type { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import {
	type CommandResponders,
	createCommandResponders,
} from "@/discord/command/command-responders";
import type { Options, Values } from "@/discord/command/options";
import { sendEmbed } from "@/discord/command/send-embed";
import { interactionLocale } from "@/discord/interaction/interaction-locale";
import type { Presenter } from "@/discord/presenter";
import type { Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";

/**
 * The handler-facing surface of a dispatched subcommand: the raw interaction,
 * the parsed & typed options, the locale resolved for this interaction, a
 * translate helper bound to it, and convenience responders that route through
 * the injected {@link Presenter}.
 */
export interface Context<O extends Options> extends CommandResponders {
	readonly interaction: ChatInputCommandInteraction;
	readonly options: Values<O>;
	reply(embed: EmbedBuilder): Promise<void>;
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
		...createCommandResponders(interaction, locale, ephemeral, { presenter, logger, translator }),
		interaction,
		options,
		reply: (embed) => sendEmbed(interaction, embed, ephemeral, logger),
	};
}
