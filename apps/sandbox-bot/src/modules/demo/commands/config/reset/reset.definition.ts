import {
	type CompiledSubcommand,
	createSubCommand,
} from "@azurioh/discord-kernel/discord/command/create-command";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { createResetHandler } from "@/modules/demo/commands/config/reset/reset.handler";
import { createResetOptions } from "@/modules/demo/commands/config/reset/reset.options";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo.catalog";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { localizedDescription } from "@/shared/discord/localized-description";

/**
 * `/config reset key`: put one demo setting, or all of them, back to the default.
 *
 * @param settings - resolves the settings service on each use.
 * @param translator - translates the key suggestions.
 */
export function createResetSubcommand(
	settings: () => SettingsService,
	translator: Translator,
): CompiledSubcommand {
	return createSubCommand({
		...localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.resetDescription),
		options: createResetOptions(translator),
		handler: createResetHandler(settings),
	});
}
