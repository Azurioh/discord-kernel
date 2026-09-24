import type { AutocompleteResolver } from "@azurioh/discord-kernel/discord/command/options";
import { resolveLocale } from "@azurioh/discord-kernel/i18n/locale";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import {
	DEMO_FIELD_ENTRIES,
	keyedLabelOf,
} from "@/modules/demo/commands/config/shared/setting-key/setting-key.helper";
import type { Translate } from "@/shared/i18n/translate";

/** One autocomplete suggestion for a setting key. */
interface SettingKeyChoice {
	readonly name: string;
	readonly value: string;
}

/** The choices a subcommand offers beyond the declared keys, in the member's language. */
export type ExtraSettingKeyChoices = (t: Translate) => readonly SettingKeyChoice[];

/**
 * The `key` option of `/config set` and `/config reset`: suggest the declared
 * keys whose key or translated label starts with what was typed, followed by
 * the subcommand's own extra choices.
 *
 * @param translator - translates the labels in the member's language.
 * @param extraChoices - the choices a subcommand offers beyond the declared keys.
 */
export function createSettingKeyAutocomplete(
	translator: Translator,
	extraChoices: ExtraSettingKeyChoices,
): AutocompleteResolver {
	return (interaction) => {
		const locale = resolveLocale(
			[interaction.locale, interaction.guildLocale],
			translator.defaultLocale,
		);
		const t: Translate = (key, params) => translator.translate(locale, key, params);
		const typed = interaction.options.getFocused().toLowerCase();
		const choices: readonly SettingKeyChoice[] = [
			...DEMO_FIELD_ENTRIES.map(([key]) => ({ name: keyedLabelOf(key, t), value: key })),
			...extraChoices(t),
		];
		return choices.filter(
			(choice) =>
				choice.value.toLowerCase().startsWith(typed) || choice.name.toLowerCase().startsWith(typed),
		);
	};
}
