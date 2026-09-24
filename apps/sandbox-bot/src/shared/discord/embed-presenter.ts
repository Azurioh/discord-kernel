import { CORE_MESSAGES } from "@azurioh/discord-kernel/discord/i18n";
import type { Presenter } from "@azurioh/discord-kernel/discord/presenter";
import { EMBED_COLORS } from "@azurioh/discord-kernel/discord/ui/colors";
import { buildEmbed } from "@azurioh/discord-kernel/discord/ui/embed";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";

/**
 * The {@link Presenter} the kernel expects the application to provide: one
 * titled embed per outcome, titles and incident footer from the core catalog.
 */
export function createEmbedPresenter(translator: Translator): Presenter {
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
