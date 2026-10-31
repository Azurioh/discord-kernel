import { describe, expect, it } from "vitest";
import { createFixedLocaleResolver } from "@/discord/interaction/fixed-locale-resolver";

describe("createFixedLocaleResolver", () => {
	it("resolves the given locale for any interaction", async () => {
		const resolver = createFixedLocaleResolver("fr");

		await expect(
			resolver.resolve({ locale: "en-US", guildLocale: "de", guildId: "1" }),
		).resolves.toBe("fr");
		await expect(
			resolver.resolve({ locale: "es-ES", guildLocale: null, guildId: null }),
		).resolves.toBe("fr");
	});
});
