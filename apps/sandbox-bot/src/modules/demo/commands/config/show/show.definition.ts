import {
	type CompiledSubcommand,
	createSubCommand,
} from "@azurioh/discord-kernel/discord/command/create-command";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { createShowHandler } from "@/modules/demo/commands/config/show/show.handler";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo.catalog";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { localizedDescription } from "@/shared/discord/localized-description";

/**
 * `/config show`: every demo setting in one embed.
 *
 * @param settings - resolves the settings service on each use.
 */
export function createShowSubcommand(settings: () => SettingsService): CompiledSubcommand {
	return createSubCommand({
		...localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.showDescription),
		handler: createShowHandler(settings),
	});
}
