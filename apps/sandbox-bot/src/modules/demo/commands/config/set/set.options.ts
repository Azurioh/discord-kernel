import { createStringOption } from "@azurioh/discord-kernel/discord/command/options";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import { createSettingKeyOption } from "@/modules/demo/commands/config/shared/setting-key/setting-key.options";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo.catalog";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { localizedDescription } from "@/shared/discord/localized-description";

/**
 * The options of `/config set`: the key to change, autocompleted, and its new
 * value, JSON when it parses and plain text otherwise.
 *
 * @param translator - translates the key suggestions in the member's language.
 */
export function createSetOptions(translator: Translator) {
	const value = localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.setValueDescription);
	return {
		key: createSettingKeyOption({ translator, description: DEMO_MESSAGES.setKeyDescription }),
		value: createStringOption(value.description, {}, value).required(),
	};
}

export type SetOptions = ReturnType<typeof createSetOptions>;
