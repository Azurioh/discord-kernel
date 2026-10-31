import type { EmbedBuilder } from "discord.js";
import { CORE_MESSAGES } from "@/discord/i18n";
import type { LocaleSubject } from "@/discord/interaction/locale-resolver";
import { type ReplyLocaleDeps, replyLocale } from "@/discord/interaction/reply-locale";
import type { Presenter } from "@/discord/presenter";
/** Render the unavailable owning module denial in the resolved reply language.
 * @param interaction - Locale subject.
 * @param deps - Reply language, translator and presenter.
 * @returns The translated denial embed.
 */
export async function moduleUnavailableEmbed(
	interaction: LocaleSubject,
	deps: ReplyLocaleDeps & { readonly presenter: Presenter },
): Promise<EmbedBuilder> {
	const locale = await replyLocale(interaction, deps);
	return deps.presenter.denial(
		deps.translator.translate(locale, CORE_MESSAGES.moduleUnavailable),
		locale,
	);
}
