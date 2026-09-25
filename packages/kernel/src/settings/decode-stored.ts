import type { SettingsDeclaration } from "@/settings/define-settings";
import { parseFieldValue, pruneStoredValue } from "@/settings/fields/zod-schema";
import { isPlainObject } from "@/settings/is-plain-object";

/** Stored values sorted into what a guild can read and what it cannot. */
export interface DecodedStored {
	/** The declared fields whose stored value is valid, in stored form. */
	readonly values: Readonly<Record<string, unknown>>;
	/** The declared fields whose stored value fails validation, in declared order. */
	readonly invalidKeys: readonly string[];
}

/**
 * Check stored values against a declaration, field by field, without any guild
 * lookup: a key the declaration no longer declares is ignored, an undeclared
 * toggle is dropped (FR-017), and a value that fails its field is left out and
 * reported. An unset field is absent from both outputs.
 *
 * @param declaration - the module's current settings declaration.
 * @param raw - the stored values, or a migration's result: any value; anything
 * but a plain object holds no field.
 */
export function decodeStored(declaration: SettingsDeclaration, raw: unknown): DecodedStored {
	const stored = isPlainObject(raw) ? raw : {};
	const values: Record<string, unknown> = {};
	const invalidKeys: string[] = [];
	for (const [key, declared] of Object.entries(declaration.fields)) {
		if (!Object.hasOwn(stored, key)) {
			continue;
		}
		const value = pruneStoredValue({ field: declared, value: stored[key] });
		const parsed = parseFieldValue({ field: declared, value });
		if (parsed.ok) {
			values[key] = parsed.value;
		} else {
			invalidKeys.push(key);
		}
	}
	return { values, invalidKeys };
}
