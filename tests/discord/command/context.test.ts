import { describe, expect, it, vi } from "vitest";
import { createContext } from "@/discord/command/context";
import type { Presenter } from "@/discord/presenter";
import { createTranslator, TranslationRegistry, type Translator } from "@/i18n";
import type { Logger } from "@/logger";

function makeLogger(): Logger {
	const logger: Logger = {
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
		child: () => logger,
	};
	return logger;
}

function makeTranslator(defaultLocale: "en" | "fr" = "en"): Translator {
	const registry = new TranslationRegistry();
	registry.register({
		"test.greeting": { en: "Hello {name}", fr: "Bonjour {name}" },
		"test.only-en": { en: "English only" },
	});
	return createTranslator(registry, { defaultLocale, logger: makeLogger() });
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
		makeLogger(),
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
});
