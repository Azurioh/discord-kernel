import { describe, expect, expectTypeOf, it } from "vitest";
import type { BotModule } from "@/module/module";
import type { SettingsDeclaration } from "@/settings/define-settings";
import { defineSettings } from "@/settings/define-settings";
import { field } from "@/settings/fields/builders";
import { sampleSettings } from "../settings/fixtures/sample-declaration";

const otherSettings = defineSettings({
	id: "other",
	version: 1,
	labels: { title: "other.settings.title" },
	fields: { enabled: field.boolean({ label: "other.settings.enabled", default: true }) },
});

describe("BotModule — settings contribution", () => {
	it("accepts declarations of different shapes in one module", () => {
		const module: BotModule = {
			name: "sample",
			settings: [sampleSettings, otherSettings],
			defaultEnabled: false,
		};

		expect(module.settings).toEqual([sampleSettings, otherSettings]);
		expect(module.defaultEnabled).toBe(false);
	});

	it("keeps both fields optional", () => {
		const module: BotModule = { name: "bare" };

		expect(module.settings).toBeUndefined();
		expect(module.defaultEnabled).toBeUndefined();
	});

	it("exposes the declarations read-only and the flag as a boolean", () => {
		expectTypeOf<BotModule["settings"]>().toEqualTypeOf<
			readonly SettingsDeclaration[] | undefined
		>();
		expectTypeOf<BotModule["defaultEnabled"]>().toEqualTypeOf<boolean | undefined>();
	});
});
