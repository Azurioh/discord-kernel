import { describe, expect, expectTypeOf, it } from "vitest";
import { TranslationRegistry } from "@/i18n/catalog";
import type { Locale } from "@/i18n/locale";
import { SETTINGS_CATALOG } from "@/settings/messages";
import { createSettingsRegistry } from "@/settings/registry";
import { SettingsDeclarationError } from "@/settings/settings-declaration-error";
import { KERNEL_SETTINGS_ID, kernelSettings } from "@/settings/system/kernel-settings";
import type { SettingsValues } from "@/settings/types";
import { createReadOnlySettingsService } from "../fixtures/read-only-settings-service";

const GUILD = "100000000000000001";

describe("kernelSettings", () => {
	it("is the declaration of id kernel", () => {
		expect(kernelSettings([]).id).toBe(KERNEL_SETTINGS_ID);
		expect(KERNEL_SETTINGS_ID).toBe("kernel");
	});

	it("declares one toggle per module, keyed by module name", () => {
		const declaration = kernelSettings([{ name: "tickets" }, { name: "levels" }]);

		expect(declaration.fields.modules.spec).toMatchObject({
			kind: "toggles",
			keys: ["tickets", "levels"],
		});
	});

	it("enables a module by default unless it says otherwise", () => {
		const declaration = kernelSettings([
			{ name: "tickets" },
			{ name: "levels", defaultEnabled: true },
			{ name: "beta", defaultEnabled: false },
		]);

		expect(declaration.fields.modules.default).toEqual({
			tickets: true,
			levels: true,
			beta: false,
		});
	});

	it("offers every supported locale, optional", () => {
		const { locale } = kernelSettings([]).fields;

		expect(locale.spec).toMatchObject({ kind: "enum" });
		expect(locale.spec.kind === "enum" && locale.spec.choices.map(({ value }) => value)).toEqual([
			"en",
			"fr",
		]);
		expect(locale.required).toBe(false);
		expect(locale.default).toBeUndefined();
	});

	it("types its values as module toggles and an optional locale", () => {
		type Values = SettingsValues<ReturnType<typeof kernelSettings>>;

		expectTypeOf<Values["modules"]>().toEqualTypeOf<Readonly<Record<string, boolean>>>();
		expectTypeOf<Values["locale"]>().toEqualTypeOf<Locale | undefined>();
	});

	it("rejects two modules of the same name", () => {
		const create = () => kernelSettings([{ name: "tickets" }, { name: "tickets" }]);

		expect(create).toThrow(SettingsDeclarationError);
	});

	it("reads each module's default for a guild that never stored anything", async () => {
		const declaration = kernelSettings([
			{ name: "tickets" },
			{ name: "beta", defaultEnabled: false },
		]);
		const { service } = await createReadOnlySettingsService();

		const values = await service.get(declaration, GUILD);

		expect(values).toEqual({ modules: { tickets: true, beta: false }, locale: undefined });
	});
});

describe("createSettingsRegistry and the kernel declaration", () => {
	function translations(): TranslationRegistry {
		const registry = new TranslationRegistry();
		registry.register(SETTINGS_CATALOG);
		return registry;
	}

	it("always registers the kernel declaration first", () => {
		const registry = createSettingsRegistry({ declarations: [], translations: translations() });

		expect(registry.declarations.map(({ id }) => id)).toEqual([KERNEL_SETTINGS_ID]);
		expect(registry.get(KERNEL_SETTINGS_ID)).toBe(registry.kernel);
	});

	it("builds the kernel declaration from the registered modules", () => {
		const registry = createSettingsRegistry({
			declarations: [],
			translations: translations(),
			modules: [{ name: "tickets" }, { name: "beta", defaultEnabled: false }],
		});

		expect(registry.kernel.fields.modules.default).toEqual({ tickets: true, beta: false });
	});

	it("checks the kernel declaration's catalog keys like any other", () => {
		const create = () =>
			createSettingsRegistry({ declarations: [], translations: new TranslationRegistry() });

		expect(create).toThrow(SettingsDeclarationError);
		expect(create).toThrow(/"kernel"/);
	});
});
