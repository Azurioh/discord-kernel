import { demoSettings } from "@/modules/demo/settings/demo-settings";
import type { Translate } from "@/shared/i18n/translate";

/** Every declared field of the demo settings, in declaration order. */
export const DEMO_FIELD_ENTRIES = Object.entries(demoSettings.fields);

/** Catalog key of each field's label; `defineSettings` guarantees one per field. */
const LABEL_BY_KEY: ReadonlyMap<string, string> = new Map(
	DEMO_FIELD_ENTRIES.flatMap(([key, declared]) => (declared.label ? [[key, declared.label]] : [])),
);

/** The translated label of a declared key, or the key itself when it is not declared. */
export function labelOf(key: string, t: Translate): string {
	const label = LABEL_BY_KEY.get(key);
	return label === undefined ? key : t(label);
}

/** A declared key as a member reads it in a list: its translated label, then the key. */
export function keyedLabelOf(key: string, t: Translate): string {
	return `${labelOf(key, t)} (${key})`;
}
