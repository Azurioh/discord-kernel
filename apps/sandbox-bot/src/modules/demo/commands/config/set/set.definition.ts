import {
	type CompiledSubcommand,
	createSubCommand,
} from "@azurioh/discord-kernel/discord/command/create-command";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { createSetHandler } from "@/modules/demo/commands/config/set/set.handler";
import { createSetOptions } from "@/modules/demo/commands/config/set/set.options";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo-catalog";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo-messages";
import { localizedDescription } from "@/shared/discord/localized-description";

/**
 * `/config set key value`: change one demo setting.
 *
 * @param settings - resolves the settings service on each use.
 * @param translator - translates the key suggestions.
 */
export function createSetSubcommand(
	settings: () => SettingsService,
	translator: Translator,
): CompiledSubcommand {
	return createSubCommand({
		...localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.setDescription),
		options: createSetOptions(translator),
		handler: createSetHandler(settings),
	});
}
