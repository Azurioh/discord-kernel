import type { PaginatorLabels } from "@azurioh/discord-kernel/discord/components/paginator";
import { PAGINATOR_MESSAGES } from "@/components/paginator/i18n/paginator.messages";
import type { Translate } from "@/shared/i18n/translate";

/**
 * The navigation buttons as the app shows them: translated text beside an arrow.
 *
 * @param t - translates in the reader's language.
 */
export function paginatorLabels(t: Translate): PaginatorLabels {
	return {
		previous: t(PAGINATOR_MESSAGES.previous),
		next: t(PAGINATOR_MESSAGES.next),
		previousEmoji: "◀️",
		nextEmoji: "▶️",
	};
}
