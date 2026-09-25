import { type Locale, resolveLocale } from "@/i18n/locale";
import type { Translator } from "@/i18n/translator";

/** The two locales Discord attaches to every interaction. */
interface LocalizedInteraction {
	readonly locale: string;
	readonly guildLocale: string | null;
}

/**
 * The reply language for one interaction: the member's client locale, then the
 * guild's, then the translator's configured default.
 */
export function interactionLocale(
	interaction: LocalizedInteraction,
	translator: Translator,
): Locale {
	return resolveLocale([interaction.locale, interaction.guildLocale], translator.defaultLocale);
}
