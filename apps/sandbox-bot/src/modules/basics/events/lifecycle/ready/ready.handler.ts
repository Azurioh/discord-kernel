import type { Logger } from "@azurioh/discord-kernel/logger";
import type { Client } from "discord.js";

/**
 * Log once the gateway session is ready.
 *
 * @param logger - receives the ready record.
 */
export function createReadyHandler(logger: Logger): (client: Client<true>) => void {
	return (client) => {
		logger.info(
			{ user: client.user.tag, guilds: client.guilds.cache.size },
			"Sandbox bot is ready",
		);
	};
}
