/**
 * The languages the framework can render replies in. `en` is structurally the
 * fallback source: every catalog entry must provide it (see `catalog.ts`), so
 * adding a language here can degrade gracefully instead of failing lookups.
 */
export const SUPPORTED_LOCALES = ["en", "fr"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** The language every catalog entry provides (`CatalogEntry.en`): the last fallback of any lookup. */
export const SOURCE_LOCALE: Locale = "en";

/**
 * Map a raw Discord locale string (`en-US`, `en-GB`, `fr`, `de`…) to a
 * supported base language. Regional variants collapse to their base tag, so
 * both English variants resolve to `en` without duplicating catalog entries.
 * Returns `undefined` for unsupported languages so callers can keep walking
 * their fallback chain.
 */
export function normalizeLocale(raw: string | null | undefined): Locale | undefined {
	if (!raw) {
		return undefined;
	}
	const base = raw.split("-")[0]?.toLowerCase();
	return SUPPORTED_LOCALES.find((locale) => locale === base);
}

/**
 * Pick the reply language for one message: the first supported candidate wins,
 * otherwise the configured default. Callers list candidates in priority order
 * (user locale, then guild locale).
 */
export function resolveLocale(
	candidates: readonly (string | null | undefined)[],
	defaultLocale: Locale,
): Locale {
	for (const candidate of candidates) {
		const normalized = normalizeLocale(candidate);
		if (normalized !== undefined) {
			return normalized;
		}
	}
	return defaultLocale;
}
