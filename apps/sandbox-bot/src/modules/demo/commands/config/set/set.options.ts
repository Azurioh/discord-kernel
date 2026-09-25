import { createStringOption } from "@azurioh/discord-kernel/discord/command/options";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { createSettingValueAutocomplete } from "@/modules/demo/commands/config/set/set.autocomplete";
import { createSettingKeyOption } from "@/modules/demo/commands/config/shared/setting-key/setting-key.options";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo.catalog";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { localizedDescription } from "@/shared/discord/localized-description";

/**
 * The options of `/config set`: the key to change, and its new value, JSON
 * when it parses and plain text otherwise; both autocompleted, the value
 * with the kernel's suggestions for the key.
 *
 * @param settings - resolves the settings service on each use.
 * @param translator - translates the key suggestions in the member's language.
 */
export function createSetOptions(settings: () => SettingsService, translator: Translator) {
	const value = localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.setValueDescription);
	return {
		key: createSettingKeyOption({ translator, description: DEMO_MESSAGES.setKeyDescription }),
		value: createStringOption(value.description, {}, value)
			.required()
			.withAutocomplete(createSettingValueAutocomplete(settings, translator)),
	};
}

export type SetOptions = ReturnType<typeof createSetOptions>;
