import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import { ALL_FIELDS } from "@/modules/demo/commands/config/reset/all-fields.constant";
import { createSettingKeyOption } from "@/modules/demo/commands/config/shared/setting-key.options";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";

/**
 * The options of `/config reset`: a declared key, or `all`, autocompleted.
 *
 * @param translator - translates the key suggestions in the member's language.
 */
export function createResetOptions(translator: Translator) {
	return {
		key: createSettingKeyOption({
			translator,
			description: DEMO_MESSAGES.resetKeyDescription,
			extraChoices: (t) => [{ name: t(DEMO_MESSAGES.allFields), value: ALL_FIELDS }],
		}),
	};
}

export type ResetOptions = ReturnType<typeof createResetOptions>;
