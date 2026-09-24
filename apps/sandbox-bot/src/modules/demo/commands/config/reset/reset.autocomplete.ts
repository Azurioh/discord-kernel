import type { AutocompleteResolver } from "@azurioh/discord-kernel/discord/command/options";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import { ALL_FIELDS } from "@/modules/demo/commands/config/reset/all-fields";
import { suggestSettingKeys } from "@/modules/demo/commands/config/shared/suggest-setting-keys";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo-messages";

/**
 * `/config reset key`: suggest the declared keys, then the one that stands for all of them.
 *
 * @param translator - translates the labels in the member's language.
 */
export function createResetKeyAutocomplete(translator: Translator): AutocompleteResolver {
	return suggestSettingKeys(translator, (t) => [
		{ name: t(DEMO_MESSAGES.allFields), value: ALL_FIELDS },
	]);
}
