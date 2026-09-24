import type { MessageKey, ModuleCatalog } from "@/shared/i18n/module-catalog";

export const BASICS_MESSAGES = {
	pingDescription: "basics.ping.description",
	pong: "basics.ping.pong",
	rollDescription: "basics.roll.description",
	rollSidesDescription: "basics.roll.sides-description",
	rollResult: "basics.roll.result",
	pagesDescription: "basics.pages.description",
	pagesTitle: "basics.pages.title",
	pagesItem: "basics.pages.item",
	pagesFooter: "basics.pages.footer",
	pagesPrevious: "basics.pages.previous",
	pagesNext: "basics.pages.next",
} as const;

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
	[BASICS_MESSAGES.pagesFooter]: {
		en: "Page {page}/{count} · {total} items",
		fr: "Page {page}/{count} · {total} éléments",
	},
	[BASICS_MESSAGES.pagesPrevious]: { en: "Previous", fr: "Précédent" },
	[BASICS_MESSAGES.pagesNext]: { en: "Next", fr: "Suivant" },
};
