import type { LocaleResolver } from "@/discord/interaction/locale-resolver";
import type { Locale } from "@/i18n/locale";

/**
 * The in-memory twin of {@link LocaleResolver}: answers `locale` for every
 * interaction.
 */
export function createFixedLocaleResolver(locale: Locale): LocaleResolver {
	return { resolve: async () => locale };
}
