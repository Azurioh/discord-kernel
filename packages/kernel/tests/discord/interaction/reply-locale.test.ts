import { describe, expect, it, vi } from "vitest";
import type { LocaleResolver } from "@/discord/interaction/locale-resolver";
import { replyLocale } from "@/discord/interaction/reply-locale";
import type { Translator } from "@/i18n/translator";
import { createFakeLogger } from "../../support/fake-logger";

const translator = { defaultLocale: "en" } as Translator;
const INTERACTION = { locale: "de", guildLocale: "fr", guildId: "100000000000000001" };

describe("replyLocale", () => {
	it("keeps the interaction's own locales when the bot gives no resolver", async () => {
		const locale = await replyLocale(INTERACTION, { translator, logger: createFakeLogger() });

		expect(locale).toBe("fr");
	});

	it("asks the bot's resolver when it gives one", async () => {
		const localeResolver: LocaleResolver = { resolve: vi.fn(async () => "en" as const) };

		const locale = await replyLocale(INTERACTION, {
			translator,
			logger: createFakeLogger(),
			localeResolver,
		});

		expect(locale).toBe("en");
		expect(localeResolver.resolve).toHaveBeenCalledWith(INTERACTION);
	});

	it("logs a failed resolver and falls back to the interaction's own locales", async () => {
		const logger = createFakeLogger();
		const localeResolver: LocaleResolver = {
			resolve: async () => {
				throw new Error("store down");
			},
		};

		const locale = await replyLocale(INTERACTION, { translator, logger, localeResolver });

		expect(locale).toBe("fr");
		expect(logger.error).toHaveBeenCalledWith(
			{ guildId: INTERACTION.guildId, err: "store down" },
			"Could not resolve the reply language; using the interaction's locales",
		);
	});
});
