import { createCommand } from "@azurioh/discord-kernel/discord/command/create-command";
import { frenchLocalization } from "@azurioh/discord-kernel/discord/command/localization";
import type { SlashCommand } from "@azurioh/discord-kernel/discord/command/types";
import { BASICS_MESSAGES } from "@/modules/basics/basics-catalog";

/** `/ping`: the smallest flat command, replying through the presenter. */
export function createPingCommand(guildIds: readonly string[]): SlashCommand {
	return createCommand({
		name: "ping",
		description: "Check that the bot answers",
		descriptionLocalizations: frenchLocalization("Vérifier que le bot répond"),
		guildIds,
		handler: async (ctx) => {
			await ctx.confirm(ctx.t(BASICS_MESSAGES.pong, { latency: ctx.interaction.client.ws.ping }));
		},
	});
}
