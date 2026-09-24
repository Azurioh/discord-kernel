import { createEvent } from "@azurioh/discord-kernel/discord/events/create-event";
import type { DiscordEvent } from "@azurioh/discord-kernel/discord/events/types";
import type { Logger } from "@azurioh/discord-kernel/logger";

/** Log once the gateway session is ready, and whenever the bot joins a guild. */
export function createLifecycleEvents(logger: Logger): DiscordEvent[] {
	return [
		createEvent({
			name: "clientReady",
			once: true,
			execute: (client) => {
				logger.info(
					{ user: client.user.tag, guilds: client.guilds.cache.size },
					"Sandbox bot is ready",
				);
			},
		}),
		createEvent({
			name: "guildCreate",
			execute: (guild) => {
				logger.info({ guildId: guild.id, name: guild.name }, "Joined a guild");
			},
		}),
	];
}
