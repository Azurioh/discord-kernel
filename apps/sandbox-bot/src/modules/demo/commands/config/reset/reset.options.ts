import { createStringOption } from "@azurioh/discord-kernel/discord/command/options";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import { createResetKeyAutocomplete } from "@/modules/demo/commands/config/reset/reset.autocomplete";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo-catalog";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo-messages";
import { localizedDescription } from "@/shared/discord/localized-description";

/**
 * The options of `/config reset`: a declared key, or `all`, autocompleted.
 *
 * @param translator - translates the key suggestions in the member's language.
 */
export function createResetOptions(translator: Translator) {
	const key = localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.resetKeyDescription);
	return {
		key: createStringOption(key.description, {}, key)
			.required()
			.withAutocomplete(createResetKeyAutocomplete(translator)),
	};
}

export type ResetOptions = ReturnType<typeof createResetOptions>;
