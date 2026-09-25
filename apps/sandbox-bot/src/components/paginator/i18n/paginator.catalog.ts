import type { KeyedCatalog, MessageKey } from "@azurioh/discord-kernel/i18n/catalog";
import { PAGINATOR_MESSAGES } from "@/components/paginator/i18n/paginator.messages";

/** The paginator's wording in English and French, keyed by {@link PAGINATOR_MESSAGES}. */
export const PAGINATOR_CATALOG: KeyedCatalog<MessageKey<typeof PAGINATOR_MESSAGES>> = {
	[PAGINATOR_MESSAGES.previous]: { en: "Previous", fr: "Précédent" },
	[PAGINATOR_MESSAGES.next]: { en: "Next", fr: "Suivant" },
	[PAGINATOR_MESSAGES.footer]: {
		en: "Page {page}/{count} · {total} items",
		fr: "Page {page}/{count} · {total} éléments",
	},
};
