import { createStringOption } from "@azurioh/discord-kernel/discord/command/options";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import {
	createSettingKeyAutocomplete,
	type ExtraSettingKeyChoices,
} from "@/modules/demo/commands/config/shared/setting-key.autocomplete";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo.catalog";
import type { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { localizedDescription } from "@/shared/discord/localized-description";
import type { MessageKey } from "@/shared/i18n/module-catalog";

/** A subcommand that adds nothing to the declared keys. */
const NO_EXTRA_CHOICES: ExtraSettingKeyChoices = () => [];

/**
 * The required `key` option shared by `/config set` and `/config reset`: a
 * declared key, autocompleted in the member's language.
 *
 * @param params.translator - translates the key suggestions.
 * @param params.description - the option's description in the demo catalog.
 * @param params.extraChoices - what the subcommand accepts beyond the declared keys.
 */
export function createSettingKeyOption(params: {
	translator: Translator;
	description: MessageKey<typeof DEMO_MESSAGES>;
	extraChoices?: ExtraSettingKeyChoices;
}) {
	const key = localizedDescription(DEMO_CATALOG, params.description);
	return createStringOption(key.description, {}, key)
		.required()
		.withAutocomplete(
			createSettingKeyAutocomplete(params.translator, params.extraChoices ?? NO_EXTRA_CHOICES),
		);
}
