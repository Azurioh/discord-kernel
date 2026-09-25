import {
	type CompiledSubcommand,
	createSubCommand,
} from "@azurioh/discord-kernel/discord/command/create-command";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import type { Logger } from "@azurioh/discord-kernel/logger";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { createEditHandler } from "@/modules/demo/commands/config/edit/edit.handler";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo.catalog";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { localizedDescription } from "@/shared/discord/localized-description";

/**
 * `/config edit`: the settings screen the kernel builds from the declaration,
 * deferred while the stored values load.
 *
 * @param settings - resolves the settings service on each use.
 * @param translator - translates the screen.
 * @param logger - receives the screen's failures.
 */
export function createEditSubcommand(
	settings: () => SettingsService,
	translator: Translator,
	logger: Logger,
): CompiledSubcommand {
	return createSubCommand({
		...localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.editDescription),
		defer: true,
		handler: createEditHandler({ settings, translator, logger }),
	});
}
