import type { BusinessError } from "@/errors";
import type { Locale } from "@/i18n/locale";
import type { Translator } from "@/i18n/translator";

/**
 * The user-facing wording of an expected failure: the catalog entry it points
 * at, or its English source when it carries none.
 *
 * Lives beside the translator rather than with any one surface: the command
 * pipeline, the `ComponentRouter` and every collector-scoped screen owe the same
 * answer to the same failure, and a screen that has to translate its own
 * refusals must not reach into another module to do it.
 */
export function resolveBusinessMessage(
	error: BusinessError,
	translator: Translator,
	locale: Locale,
): string {
	if (error.translation === undefined) {
		return error.message;
	}
	return translator.translate(locale, error.translation.key, error.translation.params);
}
