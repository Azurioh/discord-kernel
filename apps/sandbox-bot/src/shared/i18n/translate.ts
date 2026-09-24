import type { TranslationParams } from "@azurioh/discord-kernel/i18n/translator";

/** Translate a catalog key, with its placeholders; bound to the reader's locale by the caller. */
export type Translate = (key: string, params?: TranslationParams) => string;
