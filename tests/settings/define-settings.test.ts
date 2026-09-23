import { describe, expect, it } from "vitest";
import { defineSettings } from "@/settings/define-settings";
import { type AnyField, field, parseFieldValue } from "@/settings/fields";
import { SettingsDeclarationError } from "@/settings/settings-declaration-error";
import {
	SAMPLE_FIELD_ACCESS,
	SAMPLE_GROUP_ACCESS,
	SAMPLE_MODULE_ACCESS,
	sampleSettings,
} from "./fixtures/sample-declaration";

const LABEL = "test.settings.label";
const TITLE = { title: "test.settings.title" };

function choices(count: number): { value: string; label: string }[] {
	return Array.from({ length: count }, (_, index) => ({ value: `c${index}`, label: LABEL }));
}

describe("defineSettings — declaration-time errors", () => {
	it("rejects a default that fails its own field's validation", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				fields: { size: field.integer({ label: LABEL, min: 1, max: 5, default: 9 }) },
			}),
		).toThrow(SettingsDeclarationError);
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				fields: { tint: field.color({ label: LABEL, default: "not a colour" }) },
			}),
		).toThrow(/tint/);
	});

	it("rejects a default on a secret", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				// @ts-expect-error: a secret takes no default.
				fields: { key: field.secret({ label: LABEL, default: "hunter2" }) },
			}),
		).toThrow(/key/);
	});

	it("rejects examples on a secret", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				// @ts-expect-error: a secret takes no examples.
				fields: { key: field.secret({ label: LABEL, ui: { examples: ["hunter2"] } }) },
			}),
		).toThrow(/key/);
	});

	it("rejects more than 25 static choices, on an enum and on suggestions", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				fields: { pick: field.enum({ label: LABEL, choices: choices(26) }) },
			}),
		).toThrow(/pick/);
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				fields: { game: field.text({ label: LABEL, suggest: { choices: choices(26) } }) },
			}),
		).toThrow(/game/);
	});

	it("accepts exactly 25 static choices", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				fields: { pick: field.enum({ label: LABEL, choices: choices(25) }) },
			}),
		).not.toThrow();
	});

	it("rejects a field placed in an undeclared group", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				groups: { general: { label: LABEL } },
				fields: { size: field.integer({ label: LABEL, ui: { group: "limits" } }) },
			}),
		).toThrow(/limits/);
	});

	it("rejects a version above 1 without a migration", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 2,
				labels: TITLE,
				fields: { size: field.integer({ label: LABEL }) },
			}),
		).toThrow(SettingsDeclarationError);
	});

	it("accepts a version above 1 with a migration", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 2,
				labels: TITLE,
				migrate: (_fromVersion, raw) => raw,
				fields: { size: field.integer({ label: LABEL }) },
			}),
		).not.toThrow();
	});

	it("rejects a text maxLength above 4000", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				fields: { note: field.text({ label: LABEL, maxLength: 4001 }) },
			}),
		).toThrow(/note/);
	});

	it("rejects a list maxItems above 25", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				fields: { roles: field.list(field.role(), { label: LABEL, maxItems: 26 }) },
			}),
		).toThrow(/roles/);
	});

	it.each<[string, AnyField]>([
		["color", field.color()],
		["duration", field.duration()],
		["number", field.number()],
		["boolean", field.boolean()],
		["secret", field.secret()],
		["list", field.list(field.role())],
		["toggles", field.toggles({ keys: ["a"] })],
	])("rejects a list of %s items", (_kind, item) => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				fields: { items: field.list(item, { label: LABEL }) },
			}),
		).toThrow(/items/);
	});

	it("rejects a toggles default naming an undeclared key", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				fields: {
					// @ts-expect-error: `c` is not a declared key.
					flags: field.toggles({ label: LABEL, keys: ["a", "b"], default: { c: true } }),
				},
			}),
		).toThrow(/flags/);
	});

	it("rejects toggles key labels naming an undeclared key", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				fields: {
					// @ts-expect-error: `c` is not a declared key.
					flags: field.toggles({ label: LABEL, keys: ["a"], keyLabels: { c: LABEL } }),
				},
			}),
		).toThrow(/flags/);
	});

	it("rejects toggles declaring a key twice", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				fields: { flags: field.toggles({ label: LABEL, keys: ["a", "a"] }) },
			}),
		).toThrow(/flags/);
	});

	it("rejects a field without a label", () => {
		expect(() =>
			defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				fields: { size: field.integer() },
			}),
		).toThrow(/size/);
	});
});

describe("defineSettings — hints and access slots", () => {
	it("keeps the module hints and access unchanged", () => {
		expect(sampleSettings.ui).toEqual({ icon: "gear", groupOrder: ["general", "limits"] });
		expect(sampleSettings.access).toBe(SAMPLE_MODULE_ACCESS);
		expect(sampleSettings.labels).toEqual({
			title: "sample.settings.title",
			description: "sample.settings.description",
		});
	});

	it("keeps the groups and their access unchanged", () => {
		expect(sampleSettings.groups.general).toEqual({
			label: "sample.settings.group.general",
			description: "sample.settings.group.general.description",
			order: 1,
		});
		expect(sampleSettings.groups.limits.access).toBe(SAMPLE_GROUP_ACCESS);
	});

	it("keeps every field hint unchanged", () => {
		const { maxOpen, greeting, cooldown, apiKey } = sampleSettings.fields;
		expect(maxOpen.ui).toEqual({
			group: "limits",
			order: 1,
			hint: "slider",
			advanced: true,
			examples: [1, 3],
		});
		expect(maxOpen.description).toBe("sample.settings.max-open.description");
		expect(maxOpen.unit).toBe("sample.settings.unit.tickets");
		expect(greeting.placeholder).toBe("sample.settings.greeting.placeholder");
		expect(greeting.ui).toEqual({ examples: ["Welcome!"] });
		expect(cooldown.unit).toBe("sample.settings.unit.seconds");
		expect(apiKey.access).toBe(SAMPLE_FIELD_ACCESS);
		expect(apiKey.ui).toEqual({ group: "limits", advanced: true });
	});

	it("never enforces access: values still validate for anyone", () => {
		expect(parseFieldValue({ field: sampleSettings.fields.apiKey, value: "hunter2" })).toEqual({
			ok: true,
			value: "hunter2",
		});
	});

	it("accepts any opaque access value", () => {
		for (const access of [undefined, null, "admin", 42, { roles: ["1"] }, () => true]) {
			const declaration = defineSettings({
				id: "test",
				version: 1,
				labels: TITLE,
				access,
				groups: { general: { label: LABEL, access } },
				fields: { size: field.integer({ label: LABEL, access, ui: { group: "general" } }) },
			});
			expect(declaration.access).toBe(access);
			expect(declaration.groups.general.access).toBe(access);
			expect(declaration.fields.size.access).toBe(access);
		}
	});
});

describe("parseFieldValue", () => {
	it("normalises a colour to #rrggbb", () => {
		expect(parseFieldValue({ field: field.color(), value: "red" })).toEqual({
			ok: true,
			value: "#ff0000",
		});
	});

	it("parses a duration into seconds", () => {
		expect(parseFieldValue({ field: field.duration(), value: "15m" })).toEqual({
			ok: true,
			value: 900,
		});
	});

	it("reports bounds, list sizes and duplicates as kernel issue codes", () => {
		expect(parseFieldValue({ field: field.integer({ min: 2 }), value: 1 })).toEqual({
			ok: false,
			issues: [{ path: [], code: "min", params: { min: 2 } }],
		});
		expect(parseFieldValue({ field: field.text({ maxLength: 3 }), value: "abcd" })).toEqual({
			ok: false,
			issues: [{ path: [], code: "maxLength", params: { max: 3 } }],
		});
		expect(
			parseFieldValue({ field: field.list(field.role(), { minItems: 2 }), value: [] }),
		).toEqual({
			ok: false,
			issues: [{ path: [], code: "minItems", params: { min: 2 } }],
		});
		expect(
			parseFieldValue({
				field: field.list(field.role()),
				value: ["123456789012345678", "123456789012345678"],
			}),
		).toEqual({ ok: false, issues: [{ path: [1], code: "duplicate", params: {} }] });
		expect(parseFieldValue({ field: field.enum({ choices: choices(2) }), value: "nope" })).toEqual({
			ok: false,
			issues: [{ path: [], code: "unknownChoice", params: {} }],
		});
		expect(parseFieldValue({ field: field.channel(), value: "general" })).toEqual({
			ok: false,
			issues: [{ path: [], code: "type", params: {} }],
		});
	});

	it("fills the toggles missing from a value with their per-key default, else false", () => {
		const flags = field.toggles({ keys: ["a", "b", "c"], default: { b: true } });

		expect(parseFieldValue({ field: flags, value: { c: true } })).toEqual({
			ok: true,
			value: { a: false, b: true, c: true },
		});
		expect(flags.default).toEqual({ a: false, b: true, c: false });
	});

	it("reports an unknown toggle and a non-boolean toggle at their key", () => {
		const flags = field.toggles({ keys: ["a"] });

		expect(parseFieldValue({ field: flags, value: { a: 1, z: true } })).toEqual({
			ok: false,
			issues: [
				{ path: ["a"], code: "type", params: {} },
				{ path: ["z"], code: "unknownChoice", params: {} },
			],
		});
	});
});
