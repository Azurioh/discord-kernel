import { TranslationRegistry } from "@azurioh/discord-kernel/i18n/catalog";
import { createTranslator } from "@azurioh/discord-kernel/i18n/translator";
import type { AutocompleteInteraction } from "discord.js";
import { describe, expect, it } from "vitest";
import { createSettingKeyAutocomplete } from "@/modules/demo/commands/config/shared/setting-key/setting-key.autocomplete";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo.catalog";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { createPinoLogger } from "@/shared/logging/pino-logger";

function createDemoTranslator() {
	const registry = new TranslationRegistry();
	registry.register(DEMO_CATALOG);
	const logger = createPinoLogger("test", { write: () => undefined });
	return createTranslator(registry, { defaultLocale: "en", logger });
}

/** An autocomplete request from a member typing `typed` with a `locale` client. */
function autocompleteRequest(typed: string, locale: string): AutocompleteInteraction {
	return {
		locale,
		guildLocale: null,
		options: { getFocused: () => typed },
	} as unknown as AutocompleteInteraction;
}

describe("createSettingKeyAutocomplete", () => {
	it("suggests the declared keys whose key starts with what was typed, labelled in the member's language", async () => {
		const resolve = createSettingKeyAutocomplete(createDemoTranslator(), () => []);

		const choices = await resolve(autocompleteRequest("LOG", "fr"));

		expect(choices).toEqual([
			{ name: "Salon de journalisation (logChannel)", value: "logChannel" },
		]);
	});

	it("also matches on the translated label", async () => {
		const resolve = createSettingKeyAutocomplete(createDemoTranslator(), () => []);

		const choices = await resolve(autocompleteRequest("salon", "fr"));

		expect(choices.map((choice) => choice.value)).toEqual(["logChannel"]);
	});

	it("appends the subcommand's extra choices after the declared keys", async () => {
		const resolve = createSettingKeyAutocomplete(createDemoTranslator(), (t) => [
			{ name: t(DEMO_MESSAGES.allFields), value: "all" },
		]);

		const choices = await resolve(autocompleteRequest("", "en"));

		expect(choices.at(-1)).toEqual({ name: "All settings", value: "all" });
	});
});
