import { describe, expect, it } from "vitest";
import { TranslationRegistry } from "@/i18n/catalog";
import { DuplicateTranslationKeyError } from "@/i18n/errors";
import { createTranslator } from "@/i18n/translator";
import { createFakeLogger } from "../support/fake-logger";

function makeTranslator(
	catalog: Parameters<TranslationRegistry["register"]>[0],
	logger = createFakeLogger(),
) {
	const registry = new TranslationRegistry();
	registry.register(catalog);
	return createTranslator(registry, { defaultLocale: "en", logger });
}

describe("TranslationRegistry", () => {
	it("throws on a duplicate key across catalogs", () => {
		const registry = new TranslationRegistry();
		registry.register({ "a.b": { en: "one" } });
		expect(() => registry.register({ "a.b": { en: "two" } })).toThrow(DuplicateTranslationKeyError);
	});
});

describe("createTranslator", () => {
	it("translates in the requested locale", () => {
		const translator = makeTranslator({ "m.hello": { en: "Hello", fr: "Bonjour" } });
		expect(translator.translate("fr", "m.hello")).toBe("Bonjour");
	});

	it("interpolates named parameters", () => {
		const translator = makeTranslator({
			"m.pong": { en: "Pong! {ms}ms", fr: "Pong ! {ms}ms" },
		});
		expect(translator.translate("fr", "m.pong", { ms: 42 })).toBe("Pong ! 42ms");
	});

	it("falls back to English when the locale has no translation", () => {
		const translator = makeTranslator({ "m.only-en": { en: "English only" } });
		expect(translator.translate("fr", "m.only-en")).toBe("English only");
	});

	it("returns the key and warns for an unknown key", () => {
		const logger = createFakeLogger();
		const translator = makeTranslator({ "m.known": { en: "known" } }, logger);
		expect(translator.translate("en", "m.unknown")).toBe("m.unknown");
		expect(logger.warn).toHaveBeenCalled();
	});

	it("keeps the placeholder and warns when a parameter is missing", () => {
		const logger = createFakeLogger();
		const translator = makeTranslator({ "m.pong": { en: "Pong! {ms}ms" } }, logger);
		expect(translator.translate("en", "m.pong")).toBe("Pong! {ms}ms");
		expect(logger.warn).toHaveBeenCalled();
	});

	it("resolves plain strings verbatim and keyed text through the catalog", () => {
		const translator = makeTranslator({ "m.hello": { en: "Hello", fr: "Bonjour" } });
		expect(translator.resolve("fr", "raw text")).toBe("raw text");
		expect(translator.resolve("fr", { key: "m.hello" })).toBe("Bonjour");
	});
});
