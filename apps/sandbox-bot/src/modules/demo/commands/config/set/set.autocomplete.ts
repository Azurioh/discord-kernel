import type { AutocompleteResolver } from "@azurioh/discord-kernel/discord/command/options";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import { suggestSettingKeys } from "@/modules/demo/commands/config/shared/suggest-setting-keys";

/**
 * `/config set key`: suggest the declared keys only.
 *
 * @param translator - translates the labels in the member's language.
 */
export function createSetKeyAutocomplete(translator: Translator): AutocompleteResolver {
	return suggestSettingKeys(translator, () => []);
}
