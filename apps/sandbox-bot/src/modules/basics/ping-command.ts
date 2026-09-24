import { createCommand } from "@azurioh/discord-kernel/discord/command/create-command";
import type { SlashCommand } from "@azurioh/discord-kernel/discord/command/types";
import { BASICS_CATALOG, BASICS_MESSAGES } from "@/modules/basics/basics-catalog";
import { localizedDescription } from "@/shared/discord/localized-description";

/** `/ping`: the smallest flat command, replying through the presenter. */
export function createPingCommand(guildIds: readonly string[]): SlashCommand {
	return createCommand({
		name: "ping",
		...localizedDescription(BASICS_CATALOG, BASICS_MESSAGES.pingDescription),
		guildIds,
		handler: async (ctx) => {
			await ctx.confirm(ctx.t(BASICS_MESSAGES.pong, { latency: ctx.interaction.client.ws.ping }));
		},
	});
}
