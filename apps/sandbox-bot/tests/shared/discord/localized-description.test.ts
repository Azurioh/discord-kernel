import { describe, expect, it } from "vitest";
import { localizedDescription } from "@/shared/discord/localized-description";

const CATALOG = {
	"test.both": { en: "Show", fr: "Afficher" },
	"test.english": { en: "Show" },
} as const;

describe("localizedDescription", () => {
	it("takes the English text as the description and the French one as its localization", () => {
		expect(localizedDescription(CATALOG, "test.both")).toEqual({
			description: "Show",
			descriptionLocalizations: { fr: "Afficher" },
		});
	});

	it("leaves the localizations out when the entry has no French text", () => {
		expect(localizedDescription(CATALOG, "test.english")).toEqual({ description: "Show" });
	});
});
