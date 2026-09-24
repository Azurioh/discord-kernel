import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { Options } from "@azurioh/discord-kernel/discord/command/options";
import { BASICS_MESSAGES } from "@/modules/basics/i18n/basics-messages";

/** `/ping`: confirm with the gateway latency. */
export async function pingHandler<O extends Options>(ctx: Context<O>): Promise<void> {
	await ctx.confirm(ctx.t(BASICS_MESSAGES.pong, { latency: ctx.interaction.client.ws.ping }));
}
