import type { Locale } from "@/i18n/locale";

/**
 * What a {@link LocaleResolver} knows of the interaction it answers: the
 * member's client locale, and the guild's id and Discord locale (`null` outside
 * a guild). Every discord.js interaction fits as is.
 */
export interface LocaleSubject {
	readonly locale: string;
	readonly guildLocale: string | null;
	readonly guildId: string | null;
}

/**
 * The port the kernel reads the reply language through, on every path that
 * answers an interaction (commands, guards, failures, components). The bot
 * picks the implementation at composition: `createGuildLocaleResolver` for the
 * guild's language setting (FR-038), or its own. Without one, the kernel uses
 * the interaction's own locales (`interactionLocale`).
 */
export interface LocaleResolver {
	/**
	 * @returns the language to reply in.
	 * @throws whatever the implementation's lookup throws; the kernel logs it
	 * and falls back to the interaction's own locales.
	 */
	resolve(subject: LocaleSubject): Promise<Locale>;
}
