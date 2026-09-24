import { describe, expectTypeOf, it } from "vitest";
import type { SettingsValues, SurfaceValues } from "@/settings/types";
import type { sampleSettings } from "./fixtures/sample-declaration";

type Values = SettingsValues<typeof sampleSettings>;
type Surface = SurfaceValues<typeof sampleSettings>;

describe("SettingsValues", () => {
	it("types a defaulted field as its value type", () => {
		expectTypeOf<Values["accent"]>().toEqualTypeOf<string>();
		expectTypeOf<Values["cooldown"]>().toEqualTypeOf<number>();
		expectTypeOf<Values["maxOpen"]>().toEqualTypeOf<number>();
		expectTypeOf<Values["enabled"]>().toEqualTypeOf<boolean>();
		expectTypeOf<Values["watchedChannels"]>().toEqualTypeOf<readonly string[]>();
	});

	it("adds undefined to every field without a default, required or not", () => {
		expectTypeOf<Values["logChannel"]>().toEqualTypeOf<string | undefined>();
		expectTypeOf<Values["keywords"]>().toEqualTypeOf<readonly string[] | undefined>();
		expectTypeOf<Values["staffRole"]>().toEqualTypeOf<string | undefined>();
		expectTypeOf<Values["owner"]>().toEqualTypeOf<string | undefined>();
		expectTypeOf<Values["ratio"]>().toEqualTypeOf<number | undefined>();
		expectTypeOf<Values["greeting"]>().toEqualTypeOf<string | undefined>();
		expectTypeOf<Values["apiKey"]>().toEqualTypeOf<string | undefined>();
		expectTypeOf<Values["pingRoles"]>().toEqualTypeOf<readonly string[] | undefined>();
		expectTypeOf<Values["thresholds"]>().toEqualTypeOf<readonly number[] | undefined>();
	});

	it("types a toggles field as a boolean per declared key, always set", () => {
		expectTypeOf<Values["features"]>().toEqualTypeOf<
			Readonly<Record<"tickets" | "logs", boolean>>
		>();
	});

	it("keeps enum values as literals", () => {
		expectTypeOf<Values["region"]>().toEqualTypeOf<"eu" | "na">();
		expectTypeOf<Values["tiers"]>().toEqualTypeOf<readonly ("gold" | "silver")[] | undefined>();
	});

	it("has exactly the declared keys", () => {
		expectTypeOf<keyof Values>().toEqualTypeOf<
			| "logChannel"
			| "staffRole"
			| "owner"
			| "accent"
			| "cooldown"
			| "region"
			| "maxOpen"
			| "ratio"
			| "greeting"
			| "enabled"
			| "apiKey"
			| "watchedChannels"
			| "pingRoles"
			| "notifyUsers"
			| "tiers"
			| "thresholds"
			| "keywords"
			| "features"
		>();
	});

	it("rejects an unknown key and a value of the wrong type", () => {
		const read = (values: Values): void => {
			// @ts-expect-error: `missing` is not declared.
			void values.missing;
			// @ts-expect-error: `maxOpen` is a number.
			const text: string = values.maxOpen;
			// @ts-expect-error: `region` only holds its declared choices.
			const region: Values["region"] = "us";
			void [text, region];
		};
		expectTypeOf(read).toBeFunction();
	});
});

describe("SurfaceValues", () => {
	it("replaces a secret by whether it is set, and keeps every other value", () => {
		expectTypeOf<Surface["apiKey"]>().toEqualTypeOf<{ readonly isSet: boolean }>();
		expectTypeOf<Surface["maxOpen"]>().toEqualTypeOf<number>();
		expectTypeOf<Surface["staffRole"]>().toEqualTypeOf<string | undefined>();
		expectTypeOf<keyof Surface>().toEqualTypeOf<keyof Values>();
	});
});
