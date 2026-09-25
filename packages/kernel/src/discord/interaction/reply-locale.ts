import { interactionLocale } from "@/discord/interaction/interaction-locale";
import type { LocaleResolver, LocaleSubject } from "@/discord/interaction/locale-resolver";
import { errorMessage } from "@/errors/error-message";
import type { Locale } from "@/i18n/locale";
import type { Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";

/** The dependencies every reply path already carries, plus the bot's optional resolver. */
export interface ReplyLocaleDeps {
	readonly translator: Translator;
	readonly logger: Logger;
	readonly localeResolver?: LocaleResolver;
}

/**
 * The language the kernel answers an interaction in: the bot's
 * {@link LocaleResolver} when it gave one, otherwise the interaction's own
 * locales. A resolver that fails is logged and the interaction's own locales
 * are used, so a store outage never leaves a member without an answer.
 */
export async function replyLocale(subject: LocaleSubject, deps: ReplyLocaleDeps): Promise<Locale> {
	const { translator, logger, localeResolver } = deps;
	if (localeResolver === undefined) {
		return interactionLocale(subject, translator);
	}
	try {
		return await localeResolver.resolve(subject);
	} catch (error) {
		logger.error(
			{ guildId: subject.guildId, err: errorMessage(error) },
			"Could not resolve the reply language; using the interaction's locales",
		);
		return interactionLocale(subject, translator);
	}
}
