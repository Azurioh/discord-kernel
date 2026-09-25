import type { DynamicSuggestions, FieldSpec } from "@/settings/fields/field";

/**
 * The server-side search a field declares, if any: only an integer or text
 * field can declare one, as its `suggest` (static choices are not a search).
 *
 * @param spec - the field's kind and constraints.
 * @returns the search, or `undefined` when the field has none.
 */
export function fieldSearch(spec: FieldSpec): DynamicSuggestions<unknown> | undefined {
	if (spec.kind !== "integer" && spec.kind !== "text") {
		return undefined;
	}
	const { suggest } = spec;
	return suggest === undefined || "choices" in suggest ? undefined : suggest;
}
