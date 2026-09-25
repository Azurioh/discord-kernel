import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { Options } from "@azurioh/discord-kernel/discord/command/options";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { channelMention, userMention } from "discord.js";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { demoSettings } from "@/modules/demo/settings/demo.settings";
import { requestContext } from "@/shared/discord/request-context";

/**
 * `/demo-log`: post a test message in the configured log channel. The
 * command's `requireConfigured` guard already ensured the channel is set.
 *
 * @param settings - resolves the settings service on each use.
 */
export function createDemoLogHandler(
	settings: () => SettingsService,
): <O extends Options>(ctx: Context<O>) => Promise<void> {
	return async (ctx) => {
		const { guildId, userId } = requestContext(ctx);
		const { logChannel } = await settings().get(demoSettings, guildId);
		const channel =
			logChannel === undefined ? null : await ctx.interaction.client.channels.fetch(logChannel);
		if (!channel?.isSendable()) {
			await ctx.error(ctx.t(DEMO_MESSAGES.demoLogUnavailable));
			return;
		}
		await channel.send(ctx.t(DEMO_MESSAGES.demoLogPost, { member: userMention(userId) }));
		await ctx.confirm(ctx.t(DEMO_MESSAGES.demoLogPosted, { channel: channelMention(channel.id) }));
	};
}
