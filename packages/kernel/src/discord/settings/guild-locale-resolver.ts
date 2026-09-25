import type { LocaleResolver } from "@/discord/interaction/locale-resolver";
import { normalizeLocale, resolveLocale } from "@/i18n/locale";
import type { Translator } from "@/i18n/translator";
import type { SettingsRegistry } from "@/settings/registry";
import type { SettingsService } from "@/settings/settings-service";

/**
 * The default {@link LocaleResolver} of a bot with settings (FR-038): the
 * member's locale if supported, then the guild's language setting
 * (`registry.kernel`, read through the service's cache), then the guild's
 * Discord locale if supported, then the translator's default.
 *
 * The setting is read only when the member's locale is not supported, and
 * never outside a guild. A failed read rejects: the kernel's
 * reply paths log it and fall back to the interaction's own locales.
 *
 * @param deps.service - reads the guild's kernel settings.
 * @param deps.registry - holds the kernel declaration.
 * @param deps.translator - gives the bot's default language.
 * @returns the resolver to hand to the command and component routers.
 */
export function createGuildLocaleResolver(deps: {
	service: SettingsService;
	registry: SettingsRegistry;
	translator: Translator;
}): LocaleResolver {
	const { service, registry, translator } = deps;
	return {
		async resolve({ locale, guildLocale, guildId }) {
			const member = normalizeLocale(locale);
			if (member !== undefined || !guildId) {
				return resolveLocale([member, guildLocale], translator.defaultLocale);
			}
			const setting = (await service.get(registry.kernel, guildId)).locale;
			return resolveLocale([setting, guildLocale], translator.defaultLocale);
		},
	};
}
