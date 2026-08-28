import type { SettingsEditorField } from "@/discord/components/settings-editor/settings-editor-fields";

/**
 * The level every screen opens on. Its fields are the ones handed to the editor
 * directly, so a screen with no depth at all never names a level.
 */
export const ROOT_LEVEL_KEY = "root";

/**
 * One level of a screen: the settings it offers and what it is called.
 *
 * A screen declares its deeper levels the same way it declares its fields — as
 * pure data — so the menu, the heading and the return control are all built from
 * one source rather than three that have to agree.
 */
export interface SettingsEditorLevel<F extends string> {
	/** Identifies the level. A field of kind `level` names one to descend into. */
	readonly key: string;
	/** What this level is called, shown in the heading so the reader knows where they are. */
	readonly titleKey: string;
	readonly fields: readonly SettingsEditorField<F>[];
	/**
	 * How this level offers its entries. `"sections"`, the default, gives each
	 * its own row with its hint and button; `"buttons"` folds them into a
	 * single row, for a level whose entries act on what the picker above has
	 * already named and whose hint would only repeat the row.
	 */
	readonly entryLayout?: "sections" | "buttons";
}

/**
 * Where the screen currently is, outermost first.
 *
 * Never empty: the root is always its first entry, which is what makes
 * "is there anywhere to go back to" a length check rather than a special case.
 */
export type SettingsEditorPath = readonly string[];

/** The level being rendered — the last one entered. */
export function currentLevelKey(path: SettingsEditorPath): string {
	return path[path.length - 1] ?? ROOT_LEVEL_KEY;
}

/** Whether there is a level above the current one to return to. */
export function canReturn(path: SettingsEditorPath): boolean {
	return path.length > 1;
}

/**
 * Descend into `key`.
 *
 * Re-entering a level already on the path unwinds to it rather than stacking a
 * second copy: a screen that let the same level appear twice would need two
 * clicks of the return control to leave one place.
 */
export function pushLevel(path: SettingsEditorPath, key: string): SettingsEditorPath {
	const existing = path.indexOf(key);
	if (existing !== -1) {
		return path.slice(0, existing + 1);
	}
	return [...path, key];
}

/** Go back one level. At the root there is nothing to pop, so the path stands. */
export function popLevel(path: SettingsEditorPath): SettingsEditorPath {
	return canReturn(path) ? path.slice(0, -1) : path;
}
