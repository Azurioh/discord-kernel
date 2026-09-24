import type { CatalogEntry } from "@azurioh/discord-kernel/i18n/catalog";

/** The catalog keys a module's `*_MESSAGES` constant holds. */
export type MessageKey<M extends Readonly<Record<string, string>>> = M[keyof M];

/**
 * A module catalog with exactly one entry per key: a key without its entry, or
 * an entry under a key no `*_MESSAGES` constant declares, fails to compile.
 */
export type ModuleCatalog<K extends string> = Readonly<Record<K, CatalogEntry>>;
