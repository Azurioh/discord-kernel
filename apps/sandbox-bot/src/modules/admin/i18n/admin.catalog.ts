import type { KeyedCatalog, MessageKey } from "@azurioh/discord-kernel/i18n/catalog";
import { ADMIN_MESSAGES } from "@/modules/admin/i18n/admin.messages";

/** The admin module's wording in English and French, keyed by {@link ADMIN_MESSAGES}. */
export const ADMIN_CATALOG: KeyedCatalog<MessageKey<typeof ADMIN_MESSAGES>> = {
	[ADMIN_MESSAGES.serverDescription]: {
		en: "Turn the bot's modules on or off and pick its language on this server",
		fr: "Activer ou désactiver les modules du bot et choisir sa langue sur ce serveur",
	},
	[ADMIN_MESSAGES.serverIntro]: {
		en: "A disabled module's commands answer that they are off here, and its events are skipped. This screen always stays available.",
		fr: "Les commandes d'un module désactivé répondent qu'il est désactivé ici, et ses événements sont ignorés. Cet écran reste toujours disponible.",
	},
};
