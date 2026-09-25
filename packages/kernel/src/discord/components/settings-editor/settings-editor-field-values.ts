import type { SettingsEditorFieldValue } from "@/discord/components/settings-editor/settings-editor-fields";

/** A text override, as the modal editing it opens on. */
export function textFieldValue(value: string | null): SettingsEditorFieldValue {
	return { text: value, uploaded: false, picked: [] };
}

/** A picker override, as the modal editing it opens on — prefilled from what it already holds. */
export function pickedFieldValue(ids: readonly string[]): SettingsEditorFieldValue {
	return { text: null, uploaded: false, picked: ids };
}
