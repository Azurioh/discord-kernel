import type { SettingsEditorCardChrome } from "@azurioh/discord-kernel/discord/components/settings-editor/settings-editor.view";

/**
 * The frame the app puts around a generated settings screen: the
 * declaration's title, a one-line intro, no preview and no uploads.
 *
 * @param titleKey - the catalog key of the screen's title.
 * @param intro - the line shown above the settings, already translated.
 */
export function settingsScreenChrome(
	titleKey: string,
	intro: string,
): SettingsEditorCardChrome<unknown, never> {
	return {
		layout: "card",
		titleKey,
		preview: () => [{ kind: "text", content: intro }],
		filesOf: () => [],
	};
}
