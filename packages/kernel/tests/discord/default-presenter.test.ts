import { describe, expect, it } from "vitest";
import { createDefaultPresenter } from "@/discord/default-presenter";
import { CORE_CATALOG, CORE_MESSAGES } from "@/discord/i18n";
import type { Presenter } from "@/discord/presenter";
import { EMBED_COLORS, type EmbedColors } from "@/discord/ui/colors";
import type { View } from "@/discord/view/view";
import { TranslationRegistry } from "@/i18n/catalog";
import type { Locale } from "@/i18n/locale";
import { createTranslator } from "@/i18n/translator";
import { createFakeLogger } from "../support/fake-logger";

const MESSAGE = "Something happened.";
const REFERENCE = "ERR-1234";
const LOCALES: readonly Locale[] = ["en", "fr"];

/** The JSON of the single embed a V1 view carries; fails on any other shape. */
function soleEmbedJSON(view: View) {
	expect(view.components).toBeUndefined();
	expect(view.embeds).toHaveLength(1);
	const [embed] = view.embeds ?? [];
	if (embed === undefined) {
		throw new TypeError("The view carries no embed");
	}
	return embed.toJSON();
}

function makePresenter(): Presenter {
	const registry = new TranslationRegistry();
	registry.register(CORE_CATALOG);
	return createDefaultPresenter(
		createTranslator(registry, { defaultLocale: "en", logger: createFakeLogger() }),
	);
}

const OUTCOMES: readonly {
	readonly method: Exclude<keyof Presenter, "systemError">;
	readonly title: keyof typeof CORE_CATALOG;
	readonly color: keyof EmbedColors;
}[] = [
	{ method: "confirmation", title: CORE_MESSAGES.presenterSuccessTitle, color: "success" },
	{ method: "warning", title: CORE_MESSAGES.presenterWarningTitle, color: "warning" },
	{ method: "error", title: CORE_MESSAGES.presenterErrorTitle, color: "danger" },
	{ method: "denial", title: CORE_MESSAGES.presenterDenialTitle, color: "danger" },
];

describe("createDefaultPresenter", () => {
	for (const locale of LOCALES) {
		for (const { method, title, color } of OUTCOMES) {
			it(`renders ${method} in ${locale} with its title, colour and the message`, () => {
				const embed = soleEmbedJSON(makePresenter()[method](MESSAGE, locale));

				expect(embed.title).toBe(CORE_CATALOG[title]?.[locale]);
				expect(embed.color).toBe(EMBED_COLORS[color]);
				expect(embed.description).toBe(MESSAGE);
				// Byte-identical to the 2.x embed: nothing else is set.
				expect(JSON.stringify(embed)).toBe(
					JSON.stringify({
						title: CORE_CATALOG[title]?.[locale],
						description: MESSAGE,
						color: EMBED_COLORS[color],
					}),
				);
			});
		}

		it(`renders systemError in ${locale} with the incident footer carrying the reference`, () => {
			const embed = soleEmbedJSON(makePresenter().systemError(MESSAGE, REFERENCE, locale));
			const footer = CORE_CATALOG[CORE_MESSAGES.presenterIncidentFooter]?.[locale];

			expect(embed.title).toBe(CORE_CATALOG[CORE_MESSAGES.presenterErrorTitle]?.[locale]);
			expect(embed.color).toBe(EMBED_COLORS.danger);
			expect(embed.description).toBe(MESSAGE);
			expect(embed.footer?.text).toBe(footer?.replace("{reference}", REFERENCE));
			expect(embed.footer?.text).toContain(REFERENCE);
			expect(JSON.stringify(embed)).toBe(
				JSON.stringify({
					title: CORE_CATALOG[CORE_MESSAGES.presenterErrorTitle]?.[locale],
					description: MESSAGE,
					color: EMBED_COLORS.danger,
					footer: { text: footer?.replace("{reference}", REFERENCE) },
				}),
			);
		});
	}
});
