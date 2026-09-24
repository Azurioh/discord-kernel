import type { Catalog } from "@azurioh/discord-kernel/i18n/catalog";

export const BASICS_MESSAGES = {
	pong: "basics.ping.pong",
	rollResult: "basics.roll.result",
	pagesTitle: "basics.pages.title",
	pagesItem: "basics.pages.item",
	pagesFooter: "basics.pages.footer",
	pagesPrevious: "basics.pages.previous",
	pagesNext: "basics.pages.next",
} as const;

export const BASICS_CATALOG: Catalog = {
	[BASICS_MESSAGES.pong]: {
		en: "Pong! Gateway latency: {latency} ms.",
		fr: "Pong ! Latence de la passerelle : {latency} ms.",
	},
	[BASICS_MESSAGES.rollResult]: {
		en: "You rolled **{value}** on a {sides}-sided die.",
		fr: "Vous avez obtenu **{value}** sur un dé à {sides} faces.",
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
