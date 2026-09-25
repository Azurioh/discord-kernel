import type { SettingsEditorChoice } from "@/discord/components/settings-editor/settings-editor-fields";
import { SETTINGS_MESSAGES } from "@/settings/messages";

/**
 * How the settings screen reads a value the settings service returned, shared
 * by what a modal opens on, what the screen shows, and which stored ids the
 * guild still has.
 */

/** The ids a stored picker value holds: none, one, or a list's. */
export function storedIds(value: unknown): readonly string[] {
	if (typeof value === "string") {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === "string");
	}
	return [];
}

/** `set` for a secret the surface reads as set, `not set` otherwise. */
export function secretStateKey(value: unknown): string {
	const isSet = typeof value === "object" && value !== null && "isSet" in value && value.isSet;
	return isSet === true ? SETTINGS_MESSAGES.secretSet : SETTINGS_MESSAGES.secretNotSet;
}

/** Whether `key` is on in a toggles value. */
export function isToggledOn(params: { value: unknown; key: string }): boolean {
	const { value, key } = params;
	return typeof value === "object" && value !== null && Reflect.get(value, key) === true;
}

/** The catalog key of the choice offering `value`, or `undefined` when none does. */
export function choiceLabelKey(params: {
	choices: readonly SettingsEditorChoice[];
	value: string;
}): string | undefined {
	return params.choices.find((choice) => choice.value === params.value)?.labelKey;
}
