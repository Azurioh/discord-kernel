import type { Logger } from "@azurioh/discord-kernel/logger";
import type { Guild } from "discord.js";

/**
 * Log every guild the bot joins.
 *
 * @param logger - receives the join record.
 */
export function createGuildCreateHandler(logger: Logger): (guild: Guild) => void {
	return (guild) => {
		logger.info({ guildId: guild.id, name: guild.name }, "Joined a guild");
	};
}
