import { describe, expect, it } from "vitest";
import { DISCORD_BLURPLE } from "@/color";
import { registerColorAliases } from "@/discord/ui/color-aliases";
import { field } from "@/settings/fields/builders";
import { parseFieldValue } from "@/settings/fields/zod-schema";

describe("parseFieldValue on a colour field", () => {
	it("accepts a hexadecimal code and a base colour name", () => {
		expect(parseFieldValue({ field: field.color(), value: "#58F" })).toEqual({
			ok: true,
			value: "#5588ff",
		});
		expect(parseFieldValue({ field: field.color(), value: "vert" })).toEqual({
			ok: true,
			value: "#008000",
		});
	});

	it("accepts Discord's brand colour by name", () => {
		expect(parseFieldValue({ field: field.color(), value: "blurple" })).toEqual({
			ok: true,
			value: DISCORD_BLURPLE,
		});
	});

	/**
	 * Aliases belong to the Discord input surface: a stored setting must mean the
	 * same colour whatever the bot registered at startup.
	 */
	it("rejects a name only a bot registered for its Discord inputs", () => {
		registerColorAliases({ ocre: "#cc7722" });

		expect(parseFieldValue({ field: field.color(), value: "ocre" })).toEqual({
			ok: false,
			issues: [{ path: [], code: "type", params: {} }],
		});
	});
});
