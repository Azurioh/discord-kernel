import { decodeStored } from "@/settings/decode-stored";
import type { SettingsDeclaration } from "@/settings/define-settings";
import { isPlainObject } from "@/settings/is-plain-object";
import type { StoredSettings } from "@/settings/ports/settings-store";

/**
 * Outcome of {@link migrateStored}. Either way, `values` are the valid declared
 * fields a guild reads; only an `ok` outcome may be written back (FR-018).
 */
export type MigrationOutcome =
	| { readonly ok: true; readonly values: Readonly<Record<string, unknown>> }
	| {
			readonly ok: false;
			readonly values: Readonly<Record<string, unknown>>;
			/** The declared fields whose migrated value fails validation. */
			readonly invalidKeys: readonly string[];
			/** What the migration threw, or why its result was refused. */
			readonly error?: unknown;
	  };

/**
 * Reshape values stored under an older declaration version with the
 * declaration's `migrate`, then validate the result through the same checks
 * as any stored value. Pure: it reads and writes nothing, and hands `migrate` a
 * copy, so the stored record is never touched.
 *
 * - `migrate` throws, is missing, or returns anything but a plain object: not
 *   `ok`, and `values` are the stored values that still validate as they are.
 * - Some migrated field fails validation: not `ok`, and `values` are the
 *   migrated fields that validate.
 * - Otherwise `ok`, with every migrated declared field; undeclared keys the
 *   migration returns are dropped.
 *
 * @param declaration - the module's current declaration.
 * @param stored - a record whose `version` is below `declaration.version`.
 */
export function migrateStored(
	declaration: SettingsDeclaration,
	stored: Pick<StoredSettings, "version" | "values">,
): MigrationOutcome {
	let migrated: unknown;
	try {
		if (declaration.migrate === undefined) {
			throw new Error(`module "${declaration.id}" declares no migration`);
		}
		migrated = declaration.migrate(stored.version, structuredClone(stored.values));
	} catch (error) {
		return { ok: false, error, ...decodeStored(declaration, stored.values) };
	}
	if (!isPlainObject(migrated)) {
		const error = new Error(`the migration of module "${declaration.id}" returned no plain object`);
		return { ok: false, error, ...decodeStored(declaration, stored.values) };
	}
	const decoded = decodeStored(declaration, migrated);
	return decoded.invalidKeys.length === 0
		? { ok: true, values: decoded.values }
		: { ok: false, ...decoded };
}
