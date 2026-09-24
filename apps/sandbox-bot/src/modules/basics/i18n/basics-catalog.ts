import { BASICS_MESSAGES } from "@/modules/basics/i18n/basics-messages";
import type { MessageKey, ModuleCatalog } from "@/shared/i18n/module-catalog";

/** The basics module's wording in English and French, keyed by `BASICS_MESSAGES`. */
export const BASICS_CATALOG: ModuleCatalog<MessageKey<typeof BASICS_MESSAGES>> = {
	[BASICS_MESSAGES.pingDescription]: {
		en: "Check that the bot answers",
		fr: "Vérifier que le bot répond",
	},
	[BASICS_MESSAGES.pong]: {
		en: "Pong! Gateway latency: {latency} ms.",
		fr: "Pong ! Latence de la passerelle : {latency} ms.",
	},
	[BASICS_MESSAGES.rollDescription]: {
		en: "Roll a die (10 s cooldown per user)",
		fr: "Lancer un dé (10 s d'attente par membre)",
	},
	[BASICS_MESSAGES.rollSidesDescription]: {
		en: "Number of sides (default 6)",
		fr: "Nombre de faces (6 par défaut)",
	},
	[BASICS_MESSAGES.rollResult]: {
		en: "You rolled **{value}** on a {sides}-sided die.",
		fr: "Vous avez obtenu **{value}** sur un dé à {sides} faces.",
	},
	[BASICS_MESSAGES.pagesDescription]: {
		en: "Browse a paginated list",
		fr: "Parcourir une liste paginée",
	},
	[BASICS_MESSAGES.pagesTitle]: { en: "Paginator demo", fr: "Démo de pagination" },
	[BASICS_MESSAGES.pagesItem]: { en: "Item #{index}", fr: "Élément n°{index}" },
};
