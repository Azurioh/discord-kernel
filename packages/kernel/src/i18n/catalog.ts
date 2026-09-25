import { DuplicateTranslationKeyError } from "@/i18n/errors";

/**
 * One translatable message. `en` is mandatory by construction — it is the last
 * link of every fallback chain, so a missing translation can only ever degrade
 * to English, never to a broken reply. Templates carry `{name}` placeholders
 * interpolated by the translator.
 */
export interface CatalogEntry {
	readonly en: string;
	readonly fr?: string;
}

/**
 * A set of keyed message templates. Keys are namespaced `<owner>.<area>.<name>`
 * (e.g. `core.presenter.success-title`, `comms.event.created`) so two modules
 * can never collide accidentally.
 */
export type Catalog = Readonly<Record<string, CatalogEntry>>;

/** The catalog keys a `*_MESSAGES` constant holds. */
export type MessageKey<M extends Readonly<Record<string, string>>> = M[keyof M];

/**
 * A catalog with exactly one entry per key: a key without its entry, or an
 * entry under a key no `*_MESSAGES` constant declares, fails to compile.
 */
export type KeyedCatalog<K extends string> = Readonly<Record<K, CatalogEntry>>;

/**
 * Accumulates the core catalog and every module's catalog at boot. Registration
 * is fail-fast: a duplicate key throws {@link DuplicateTranslationKeyError}
 * instead of silently letting one module's copy shadow another's.
 */
export class TranslationRegistry {
	private readonly entries = new Map<string, CatalogEntry>();

	register(catalog: Catalog): void {
		for (const [key, entry] of Object.entries(catalog)) {
			if (this.entries.has(key)) {
				throw new DuplicateTranslationKeyError(key);
			}
			this.entries.set(key, entry);
		}
	}

	/** Whether `key` was registered by some catalog (and so has an English source). */
	has(key: string): boolean {
		return this.entries.has(key);
	}

	get(key: string): CatalogEntry | undefined {
		return this.entries.get(key);
	}
}
