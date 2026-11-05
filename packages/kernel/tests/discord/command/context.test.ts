import { EmbedBuilder, MessageFlags, TextDisplayBuilder } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { createContext } from "@/discord/command/context";
import type { Presenter } from "@/discord/presenter";
import { TranslationRegistry } from "@/i18n/catalog";
import { createTranslator, type Translator } from "@/i18n/translator";
import { createBotInteraction } from "../../support/bot-interaction";
import { createFakeLogger } from "../../support/fake-logger";

function makeTranslator(defaultLocale: "en" | "fr" = "en"): Translator {
	const registry = new TranslationRegistry();
	registry.register({
		"test.greeting": { en: "Hello {name}", fr: "Bonjour {name}" },
		"test.only-en": { en: "English only" },
	});
	return createTranslator(registry, { defaultLocale, logger: createFakeLogger() });
}

const presenterStub = {
	confirmation: vi.fn((message: string, locale: string) => ({ message, locale })),
	warning: vi.fn(),
	error: vi.fn(),
	denial: vi.fn(),
	systemError: vi.fn(),
} as unknown as Presenter;

function makeInteraction(locale: string, guildLocale: string | null) {
	return {
		locale,
		guildLocale,
		deferred: false,
		replied: false,
		reply: vi.fn(async () => undefined),
	} as never;
}

function buildContext(locale: string, guildLocale: string | null, translator = makeTranslator()) {
	return createContext(
		makeInteraction(locale, guildLocale),
		{},
		true,
		presenterStub,
		createFakeLogger(),
		translator,
	);
}

describe("createContext locale resolution", () => {
	it("uses the user's client locale when supported", () => {
		const ctx = buildContext("fr", "en-US");
		expect(ctx.locale).toBe("fr");
		expect(ctx.t("test.greeting", { name: "Ana" })).toBe("Bonjour Ana");
	});

	it("falls back to the guild locale for an unsupported client locale", () => {
		const ctx = buildContext("de", "fr");
		expect(ctx.locale).toBe("fr");
	});

	it("falls back to the default locale outside a guild (DM)", () => {
		const ctx = buildContext("de", null);
		expect(ctx.locale).toBe("en");
	});

	it("honours a configured French default", () => {
		const ctx = buildContext("ja", null, makeTranslator("fr"));
		expect(ctx.locale).toBe("fr");
	});

	it("serves English text for a key missing from the French catalog", () => {
		const ctx = buildContext("fr", null);
		expect(ctx.t("test.only-en")).toBe("English only");
	});

	it("uses the locale the pipeline resolved when it gives one", () => {
		const ctx = createContext(
			makeInteraction("de", "en"),
			{},
			true,
			presenterStub,
			createFakeLogger(),
			makeTranslator(),
			"fr",
		);
		expect(ctx.locale).toBe("fr");
		expect(ctx.t("test.greeting", { name: "Ana" })).toBe("Bonjour Ana");
	});
});

describe("createContext reply", () => {
	it("sends a V1 view through sendView", async () => {
		const interaction = createBotInteraction({ kind: "slash", name: "test", guildId: "guild" });
		const embed = new EmbedBuilder().setDescription("hello");
		const ctx = createContext(
			interaction as never,
			{},
			true,
			presenterStub,
			createFakeLogger(),
			makeTranslator(),
		);
		await ctx.reply({ embeds: [embed] });
		expect(interaction.sentPayloads()).toEqual([
			{
				method: "reply",
				payload: { embeds: [embed], components: [], flags: [MessageFlags.Ephemeral] },
			},
		]);
	});

	it("sends a V2 view through sendView, flagged Components V2", async () => {
		const interaction = createBotInteraction({ kind: "slash", name: "test", guildId: "guild" });
		const ctx = createContext(
			interaction as never,
			{},
			false,
			presenterStub,
			createFakeLogger(),
			makeTranslator(),
		);
		await ctx.reply({ components: [{ type: "text", content: "hello" }] });
		expect(interaction.sentPayloads()).toEqual([
			{
				method: "reply",
				payload: {
					components: [expect.any(TextDisplayBuilder)],
					flags: [MessageFlags.IsComponentsV2],
				},
			},
		]);
	});
});
