export { resolveBusinessMessage } from "@/i18n/business-message";
export { type Catalog, type CatalogEntry, TranslationRegistry } from "@/i18n/catalog";
export { DuplicateTranslationKeyError } from "@/i18n/errors";
export { type Locale, normalizeLocale, resolveLocale, SUPPORTED_LOCALES } from "@/i18n/locale";
export {
	createTranslator,
	type LocalizedText,
	type TranslationParams,
	type Translator,
	type TranslatorOptions,
} from "@/i18n/translator";
