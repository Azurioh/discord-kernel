import { describe, expect, it } from "vitest";
import { CORE_CATALOG } from "@/discord/i18n";
import type { Catalog } from "@/i18n/catalog";
import { SETTINGS_CATALOG } from "@/settings/messages";

/** Second-person singular pronouns and possessives, as whole words or elided (`t'`). */
const INFORMAL_PRONOUN = /(?<!\p{L})(?:tu|toi|te|ton|ta|tes)(?!\p{L})|(?<!\p{L})t['’]/iu;

/** Imperatives in the second-person singular that open a sentence. */
const INFORMAL_IMPERATIVE =
	/(?:^|[.!?;:]\s+)(?:Laisse|Vide|Choisis|Envoie|Clique|Sélectionne|Utilise|Réessaie|Essaie|Contacte|Ajoute|Saisis|Entre)(?!\p{L})/u;

const CATALOGS: Readonly<Record<string, Catalog>> = {
	CORE_CATALOG,
	SETTINGS_CATALOG,
};

describe("French catalogs", () => {
	for (const [name, catalog] of Object.entries(CATALOGS)) {
		it(`addresses the reader formally ("vous") throughout ${name}`, () => {
			for (const [key, entry] of Object.entries(catalog)) {
				const text = entry.fr ?? "";
				expect(text, key).not.toMatch(INFORMAL_PRONOUN);
				expect(text, key).not.toMatch(INFORMAL_IMPERATIVE);
			}
		});
	}
});
