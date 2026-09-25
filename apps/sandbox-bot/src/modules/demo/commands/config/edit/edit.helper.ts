import type { SettingsEditorCardChrome } from "@azurioh/discord-kernel/discord/components/settings-editor/settings-editor.view";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { demoSettings } from "@/modules/demo/settings/demo.settings";

/**
 * The frame around the generated screen: its title, a one-line intro, no
 * preview and no uploads.
 *
 * @param t - translates a catalog key into the member's language.
 */
export function editChrome(t: (key: string) => string): SettingsEditorCardChrome<unknown, never> {
	return {
		layout: "card",
		titleKey: demoSettings.labels.title,
		preview: () => [{ kind: "text", content: t(DEMO_MESSAGES.editIntro) }],
		filesOf: () => [],
	};
}
