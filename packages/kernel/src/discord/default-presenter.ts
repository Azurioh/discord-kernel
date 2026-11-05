import type { EmbedBuilder } from "discord.js";
import { CORE_MESSAGES } from "@/discord/i18n";
import type { Presenter } from "@/discord/presenter";
import { EMBED_COLORS } from "@/discord/ui/colors";
import { buildEmbed } from "@/discord/ui/embed";
import type { View } from "@/discord/view/view";
import type { Translator } from "@/i18n/translator";

/** A V1 view carrying one embed. */
function embedView(embed: EmbedBuilder): View {
	return { embeds: [embed] };
}

/**
 * The {@link Presenter} a bot gets unless it brings its own: a V1 view of one
 * titled embed per outcome, titles and incident footer from the core catalog,
 * colours from the live {@link EMBED_COLORS} palette.
 *
 * @param translator - must hold `CORE_CATALOG`.
 * @returns The default presenter.
 */
export function createDefaultPresenter(translator: Translator): Presenter {
	return {
		confirmation: (message, locale) =>
			embedView(
				buildEmbed(
					translator.translate(locale, CORE_MESSAGES.presenterSuccessTitle),
					message,
				).setColor(EMBED_COLORS.success),
			),
		warning: (message, locale) =>
			embedView(
				buildEmbed(
					translator.translate(locale, CORE_MESSAGES.presenterWarningTitle),
					message,
				).setColor(EMBED_COLORS.warning),
			),
		error: (message, locale) =>
			embedView(
				buildEmbed(
					translator.translate(locale, CORE_MESSAGES.presenterErrorTitle),
					message,
				).setColor(EMBED_COLORS.danger),
			),
		denial: (message, locale) =>
			embedView(
				buildEmbed(
					translator.translate(locale, CORE_MESSAGES.presenterDenialTitle),
					message,
				).setColor(EMBED_COLORS.danger),
			),
		systemError: (message, reference, locale) =>
			embedView(
				buildEmbed(translator.translate(locale, CORE_MESSAGES.presenterErrorTitle), message)
					.setColor(EMBED_COLORS.danger)
					.setFooter({
						text: translator.translate(locale, CORE_MESSAGES.presenterIncidentFooter, {
							reference,
						}),
					}),
			),
	};
}
