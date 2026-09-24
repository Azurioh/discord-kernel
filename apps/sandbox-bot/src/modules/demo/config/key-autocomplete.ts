import type { AutocompleteResolver } from "@azurioh/discord-kernel/discord/command/options";
import { resolveLocale } from "@azurioh/discord-kernel/i18n/locale";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import { ALL_FIELDS, DEMO_FIELD_ENTRIES, labelOf } from "@/modules/demo/config/setting-keys";
import { DEMO_MESSAGES } from "@/modules/demo/demo-catalog";

/**
 * Suggest the declared keys whose key or translated label starts with what was typed.
 *
 * @param translator - translates the labels in the member's language.
 * @param withAll - whether to also offer the key that stands for every field.
 */
export function createKeyAutocomplete(
	translator: Translator,
	withAll: boolean,
): AutocompleteResolver {
	return (interaction) => {
		const locale = resolveLocale(
			[interaction.locale, interaction.guildLocale],
			translator.defaultLocale,
		);
		const t = (key: string) => translator.translate(locale, key);
		const typed = interaction.options.getFocused().toLowerCase();
		const choices = DEMO_FIELD_ENTRIES.map(([key]) => ({
			name: `${labelOf(key, t)} (${key})`,
			value: key,
		}));
		if (withAll) {
			choices.push({ name: t(DEMO_MESSAGES.allFields), value: ALL_FIELDS });
		}
		return choices.filter(
			(choice) =>
				choice.value.toLowerCase().startsWith(typed) || choice.name.toLowerCase().startsWith(typed),
		);
	};
}
