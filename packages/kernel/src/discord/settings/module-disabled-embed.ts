import type { EmbedBuilder } from "discord.js";
import { interactionLocale } from "@/discord/interaction/interaction-locale";
import type { Presenter } from "@/discord/presenter";
import type { Translator } from "@/i18n/translator";
import { SETTINGS_MESSAGES } from "@/settings/messages";

/**
 * The answer to an interaction with a module disabled on its guild: the
 * translated "disabled on this server" message, as a denial in the reply
 * language of the interaction.
 */
export function moduleDisabledEmbed(
	interaction: { readonly locale: string; readonly guildLocale: string | null },
	deps: { readonly presenter: Presenter; readonly translator: Translator },
): EmbedBuilder {
	const locale = interactionLocale(interaction, deps.translator);
	const message = deps.translator.translate(locale, SETTINGS_MESSAGES.moduleDisabled);
	return deps.presenter.denial(message, locale);
}
