import { createCommand } from "@azurioh/discord-kernel/discord/command/create-command";
import type { SlashCommand } from "@azurioh/discord-kernel/discord/command/types";
import { pingHandler } from "@/modules/basics/commands/ping/ping.handler";
import { BASICS_CATALOG } from "@/modules/basics/i18n/basics.catalog";
import { BASICS_MESSAGES } from "@/modules/basics/i18n/basics.messages";
import { localizedDescription } from "@/shared/discord/localized-description";

/** `/ping`: the smallest flat command, replying through the presenter. */
export function createPingCommand(guildIds: readonly string[]): SlashCommand {
	return createCommand({
		name: "ping",
		...localizedDescription(BASICS_CATALOG, BASICS_MESSAGES.pingDescription),
		guildIds,
		handler: pingHandler,
	});
}
