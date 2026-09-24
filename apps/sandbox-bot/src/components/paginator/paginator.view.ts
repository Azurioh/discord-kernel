import type { PaginatorRender } from "@azurioh/discord-kernel/discord/components/paginator";
import { EMBED_COLORS } from "@azurioh/discord-kernel/discord/ui/colors";
import { buildEmbed } from "@azurioh/discord-kernel/discord/ui/embed";
import { PAGINATOR_MESSAGES } from "@/components/paginator/i18n/paginator.messages";
import type { Translate } from "@/shared/i18n/translate";

/**
 * How the app lays out one page: a neutral embed under `title`, one item per
 * line, and a footer locating the page in the whole list.
 *
 * @param title - the embed title, already translated.
 * @param t - translates the footer in the reader's language.
 */
export function createPaginatorRender(title: string, t: Translate): PaginatorRender<string> {
	return (pageItems, page, count, total) =>
		buildEmbed(title, pageItems.join("\n"))
			.setColor(EMBED_COLORS.neutral)
			.setFooter({ text: t(PAGINATOR_MESSAGES.footer, { page, count, total }) });
}
