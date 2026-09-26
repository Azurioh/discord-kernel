import type { AutocompleteResolver } from "@azurioh/discord-kernel/discord/command/options";
import { interactionLocale } from "@azurioh/discord-kernel/discord/interaction/interaction-locale";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import type { Choice, SettingsService } from "@azurioh/discord-kernel/settings";
import { demoSettings } from "@/modules/demo/settings/demo.settings";

/** Name of the option holding the key whose value is being typed. */
const KEY_OPTION = "key";

/**
 * The `value` option of `/config set`: the kernel's own suggestions for the
 * key already picked (`service.suggest`), the same a settings screen offers.
 * A value goes back as the text `/config set` parses: an item of a list
 * field as a one-item JSON list, anything else as is. Nothing is suggested
 * before a declared key is picked, or outside a guild.
 *
 * @param settings - resolves the settings service on each use.
 * @param translator - picks the member's language for the suggestions.
 */
export function createSettingValueAutocomplete(
	settings: () => SettingsService,
	translator: Translator,
): AutocompleteResolver {
	return async (interaction) => {
		const key = interaction.options.getString(KEY_OPTION);
		const { guildId } = interaction;
		if (key === null || guildId === null || !Object.hasOwn(demoSettings.fields, key)) {
			return [];
		}
		const service = settings();
		const values = await service.getForSurface(demoSettings, guildId);
		const choices = await service.suggest(demoSettings, key, interaction.options.getFocused(), {
			guildId,
			userId: interaction.user.id,
			locale: interactionLocale(interaction, translator),
			values,
		});
		const isList =
			demoSettings.fields[key as keyof typeof demoSettings.fields].spec.kind === "list";
		return choices.map(
			(choice): Choice => ({
				name: choice.name,
				value: isList ? JSON.stringify([choice.value]) : String(choice.value),
			}),
		);
	};
}
