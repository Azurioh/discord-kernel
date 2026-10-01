import { CORE_MESSAGES } from "@/discord/i18n";
import type { Presenter } from "@/discord/presenter";
import { EMBED_COLORS } from "@/discord/ui/colors";
import { buildEmbed } from "@/discord/ui/embed";
import type { Translator } from "@/i18n/translator";

/**
 * The {@link Presenter} a bot gets unless it brings its own: one titled embed
 * per outcome, titles and incident footer from the core catalog, colours from
 * the live {@link EMBED_COLORS} palette.
 *
 * @param translator - must hold `CORE_CATALOG`.
 */
export function createDefaultPresenter(translator: Translator): Presenter {
	return {
		confirmation: (message, locale) =>
			buildEmbed(
				translator.translate(locale, CORE_MESSAGES.presenterSuccessTitle),
				message,
			).setColor(EMBED_COLORS.success),
		warning: (message, locale) =>
			buildEmbed(
				translator.translate(locale, CORE_MESSAGES.presenterWarningTitle),
				message,
			).setColor(EMBED_COLORS.warning),
		error: (message, locale) =>
			buildEmbed(translator.translate(locale, CORE_MESSAGES.presenterErrorTitle), message).setColor(
				EMBED_COLORS.danger,
			),
		denial: (message, locale) =>
			buildEmbed(
				translator.translate(locale, CORE_MESSAGES.presenterDenialTitle),
				message,
			).setColor(EMBED_COLORS.danger),
		systemError: (message, reference, locale) =>
			buildEmbed(translator.translate(locale, CORE_MESSAGES.presenterErrorTitle), message)
				.setColor(EMBED_COLORS.danger)
				.setFooter({
					text: translator.translate(locale, CORE_MESSAGES.presenterIncidentFooter, { reference }),
				}),
	};
}
