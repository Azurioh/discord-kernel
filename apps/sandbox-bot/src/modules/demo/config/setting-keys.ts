import { demoSettings } from "@/modules/demo/demo-settings";
import type { Translate } from "@/shared/i18n/translate";

/** The `/config reset` key that clears every field at once. */
export const ALL_FIELDS = "all";

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
