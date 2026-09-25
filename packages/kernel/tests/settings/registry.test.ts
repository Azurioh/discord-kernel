import { describe, expect, it } from "vitest";
import { TranslationRegistry } from "@/i18n/catalog";
import { defineSettings } from "@/settings/define-settings";
import { field } from "@/settings/fields/builders";
import { createSettingsRegistry } from "@/settings/registry";
import { SettingsDeclarationError } from "@/settings/settings-declaration-error";
import { SAMPLE_KEYS, sampleSettings } from "./fixtures/sample-declaration";

/** Keys of {@link nestedSettings}, whose texts sit inside list items and suggestions. */
const NESTED_KEYS = [
	"nested.settings.title",
	"nested.settings.levels",
	"nested.settings.level",
	"nested.settings.level.description",
	"nested.settings.level.low",
	"nested.settings.size",
	"nested.settings.size.small",
	"nested.settings.motto",
	"nested.settings.motto.hello",
] as const;

const nestedSettings = defineSettings({
	id: "nested",
	version: 1,
	labels: { title: "nested.settings.title" },
	fields: {
		levels: field.list(
			field.integer({
				label: "nested.settings.level",
				description: "nested.settings.level.description",
				suggest: { choices: [{ value: 1, label: "nested.settings.level.low" }] },
			}),
			{ label: "nested.settings.levels" },
		),
		size: field.integer({
			label: "nested.settings.size",
			suggest: { choices: [{ value: 1, label: "nested.settings.size.small" }] },
		}),
		motto: field.text({
			label: "nested.settings.motto",
			suggest: { choices: [{ value: "hi", label: "nested.settings.motto.hello" }] },
		}),
	},
});

function translationsFor(keys: readonly string[]): TranslationRegistry {
	const translations = new TranslationRegistry();
	translations.register(Object.fromEntries(keys.map((key) => [key, { en: key }])));
	return translations;
}

function without(keys: readonly string[], missing: string): string[] {
	return keys.filter((key) => key !== missing);
}

describe("createSettingsRegistry", () => {
	it("accepts declarations whose every key has an English source", () => {
		const registry = createSettingsRegistry({
			declarations: [sampleSettings, nestedSettings],
			translations: translationsFor([...SAMPLE_KEYS, ...NESTED_KEYS]),
		});

		expect(registry.declarations).toEqual([sampleSettings, nestedSettings]);
		expect(registry.get("sample")).toBe(sampleSettings);
		expect(registry.get("nested")).toBe(nestedSettings);
		expect(registry.get("unknown")).toBeUndefined();
	});

	it("rejects a duplicate declaration id, naming it", () => {
		const copy = defineSettings({ ...nestedSettings });
		const create = () =>
			createSettingsRegistry({
				declarations: [nestedSettings, copy],
				translations: translationsFor(NESTED_KEYS),
			});

		expect(create).toThrow(SettingsDeclarationError);
		expect(create).toThrow(/"nested"/);
	});

	it.each(SAMPLE_KEYS)("rejects the sample declaration when %s has no English source", (key) => {
		const create = () =>
			createSettingsRegistry({
				declarations: [sampleSettings],
				translations: translationsFor(without(SAMPLE_KEYS, key)),
			});

		expect(create).toThrow(SettingsDeclarationError);
		expect(create).toThrow(`"${key}"`);
	});

	it.each(NESTED_KEYS)("rejects list item and suggestion texts: %s without English", (key) => {
		const create = () =>
			createSettingsRegistry({
				declarations: [nestedSettings],
				translations: translationsFor(without(NESTED_KEYS, key)),
			});

		expect(create).toThrow(SettingsDeclarationError);
		expect(create).toThrow(`"${key}"`);
	});
});
