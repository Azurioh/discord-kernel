import { describe, expect, it } from "vitest";
import { TranslationRegistry } from "@/i18n/catalog";

describe("TranslationRegistry.has", () => {
	it("returns true for a registered key", () => {
		const registry = new TranslationRegistry();
		registry.register({ "core.settings.title": { en: "Settings" } });

		expect(registry.has("core.settings.title")).toBe(true);
	});

	it("returns false for an unknown key", () => {
		const registry = new TranslationRegistry();
		registry.register({ "core.settings.title": { en: "Settings" } });

		expect(registry.has("core.settings.missing")).toBe(false);
	});
});
