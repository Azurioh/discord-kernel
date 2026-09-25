import { Guild } from "discord.js";

/**
 * The guild a gateway event concerns, read from its arguments: a `Guild`
 * itself (`guildCreate`), or the first argument carrying a `guildId` (a
 * message, a channel, an interaction) or a `guild` (a member, a ban, a role).
 *
 * @param args - the arguments discord.js passed to the listener.
 * @returns the guild id, or `undefined` for an event bound to no guild.
 */
export function eventGuildId(args: readonly unknown[]): string | undefined {
	for (const arg of args) {
		const guildId = guildIdOf(arg);
		if (guildId !== undefined) {
			return guildId;
		}
	}
	return undefined;
}

function guildIdOf(arg: unknown): string | undefined {
	if (arg instanceof Guild) {
		return arg.id;
	}
	if (typeof arg !== "object" || arg === null) {
		return undefined;
	}
	if ("guildId" in arg && typeof arg.guildId === "string") {
		return arg.guildId;
	}
	if ("guild" in arg && typeof arg.guild === "object" && arg.guild !== null && "id" in arg.guild) {
		return typeof arg.guild.id === "string" ? arg.guild.id : undefined;
	}
	return undefined;
}
