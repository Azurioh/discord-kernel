import { PAGINATOR_MESSAGES } from "@/components/paginator/i18n/paginator-messages";
import type { MessageKey, ModuleCatalog } from "@/shared/i18n/module-catalog";

/** The paginator's wording in English and French, keyed by {@link PAGINATOR_MESSAGES}. */
export const PAGINATOR_CATALOG: ModuleCatalog<MessageKey<typeof PAGINATOR_MESSAGES>> = {
	[PAGINATOR_MESSAGES.previous]: { en: "Previous", fr: "Précédent" },
	[PAGINATOR_MESSAGES.next]: { en: "Next", fr: "Suivant" },
	[PAGINATOR_MESSAGES.footer]: {
		en: "Page {page}/{count} · {total} items",
		fr: "Page {page}/{count} · {total} éléments",
	},
};
