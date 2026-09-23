import { describe, expect, it } from "vitest";
import { TranslationRegistry } from "@/i18n";
import { SETTINGS_CATALOG, SETTINGS_ISSUE_MESSAGES, SETTINGS_MESSAGES } from "@/settings/messages";

const PLACEHOLDER = /\{(\w+)\}/g;

function placeholders(template: string): string[] {
	return [...template.matchAll(PLACEHOLDER)].map((match) => match[1] ?? "").sort();
}

describe("SETTINGS_CATALOG", () => {
	it("has an entry for every issue code and every settings message", () => {
		const keys = [...Object.values(SETTINGS_ISSUE_MESSAGES), ...Object.values(SETTINGS_MESSAGES)];

		expect(Object.keys(SETTINGS_CATALOG).sort()).toEqual([...keys].sort());
	});

	it("keys every entry under the core.settings namespace", () => {
		for (const key of Object.keys(SETTINGS_CATALOG)) {
			expect(key).toMatch(/^core\.settings\.[a-z-]+(\.[a-z-]+)?$/);
		}
	});

	it("translates every entry to French with the same placeholders", () => {
		for (const [key, entry] of Object.entries(SETTINGS_CATALOG)) {
			expect(entry.fr, key).toBeDefined();
			expect(placeholders(entry.fr ?? ""), key).toEqual(placeholders(entry.en));
		}
	});

	it("registers without colliding with itself", () => {
		const registry = new TranslationRegistry();
		registry.register(SETTINGS_CATALOG);

		expect(registry.has(SETTINGS_MESSAGES.moduleDisabled)).toBe(true);
	});
});
