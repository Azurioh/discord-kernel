import { createCommand } from "@azurioh/discord-kernel/discord/command/create-command";
import type { SlashCommand } from "@azurioh/discord-kernel/discord/command/types";
import type { Logger } from "@azurioh/discord-kernel/logger";
import { createPagesHandler } from "@/modules/basics/commands/pages/pages.handler";
import { BASICS_CATALOG } from "@/modules/basics/i18n/basics.catalog";
import { BASICS_MESSAGES } from "@/modules/basics/i18n/basics.messages";
import { localizedDescription } from "@/shared/discord/localized-description";

/** `/pages`: the collector-backed paginator, deferred while it mounts. */
export function createPagesCommand(guildIds: readonly string[], logger: Logger): SlashCommand {
	return createCommand({
		name: "pages",
		...localizedDescription(BASICS_CATALOG, BASICS_MESSAGES.pagesDescription),
		guildIds,
		defer: true,
		handler: createPagesHandler(logger),
	});
}
