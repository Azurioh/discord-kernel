import type { EmbedBuilder } from "discord.js";
import type { LocaleSubject } from "@/discord/interaction/locale-resolver";
import { type ReplyLocaleDeps, replyLocale } from "@/discord/interaction/reply-locale";
import type { Presenter } from "@/discord/presenter";
import { SETTINGS_MESSAGES } from "@/settings/messages";

/**
 * The answer to an interaction with a module disabled on its guild: the
 * translated "disabled on this server" message, as a denial in the reply
 * language the router's `LocaleResolver` gives (or the interaction's own).
 */
export async function moduleDisabledEmbed(
	interaction: LocaleSubject,
	deps: ReplyLocaleDeps & { readonly presenter: Presenter },
): Promise<EmbedBuilder> {
	const locale = await replyLocale(interaction, deps);
	const message = deps.translator.translate(locale, SETTINGS_MESSAGES.moduleDisabled);
	return deps.presenter.denial(message, locale);
}
