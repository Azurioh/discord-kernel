import type { TranslationRegistry } from "@/i18n/catalog";
import type { Locale } from "@/i18n/locale";
import type { Logger } from "@/logger";

/** Values interpolated into a template's `{name}` placeholders. */
export type TranslationParams = Readonly<Record<string, string | number>>;

/**
 * A message that may be translated: either a plain string delivered verbatim
 * (ad-hoc dynamic text, backward-compatible call sites) or a catalog key with
 * its interpolation parameters. Accepted by guard denials, fallback errors and
 * business errors, and resolved by the dispatch pipeline with the locale of the
 * interaction being answered.
 */
export type LocalizedText = string | { readonly key: string; readonly params?: TranslationParams };

/** Translates catalog keys for a resolved locale; never throws on lookup. */
export interface Translator {
	readonly defaultLocale: Locale;
	translate(locale: Locale, key: string, params?: TranslationParams): string;
	/** Resolve a {@link LocalizedText}: plain strings pass through untranslated. */
	resolve(locale: Locale, text: LocalizedText): string;
}

export interface TranslatorOptions {
	readonly defaultLocale: Locale;
	readonly logger: Logger;
}

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

function interpolate(
	template: string,
	params: TranslationParams | undefined,
	key: string,
	logger: Logger,
): string {
	return template.replace(PLACEHOLDER_PATTERN, (placeholder, name: string) => {
		const value = params?.[name];
		if (value === undefined) {
			// A missing value is a call-site bug, but the reply must still go out:
			// keep the placeholder visible and leave a trace for the operator.
			logger.warn({ key, placeholder: name }, "Missing interpolation parameter");
			return placeholder;
		}
		return String(value);
	});
}

/**
 * Build the translator over a filled registry. Lookup order per call:
 * requested locale → configured default → `en`. A key absent from the registry
 * renders as the key itself (logged) — a lookup can degrade but never prevent
 * a reply from being delivered.
 */
export function createTranslator(
	registry: TranslationRegistry,
	options: TranslatorOptions,
): Translator {
	const { defaultLocale, logger } = options;

	const translate = (locale: Locale, key: string, params?: TranslationParams): string => {
		const entry = registry.get(key);
		if (entry === undefined) {
			logger.warn({ key }, "Unknown translation key");
			return key;
		}
		const template = entry[locale] ?? entry[defaultLocale] ?? entry.en;
		return interpolate(template, params, key, logger);
	};

	return {
		defaultLocale,
		translate,
		resolve: (locale, text) =>
			typeof text === "string" ? text : translate(locale, text.key, text.params),
	};
}
