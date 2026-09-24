import type { ClientEvents } from "discord.js";
import type { DiscordEvent } from "@/discord/events/types";

/** Helper to declare a {@link DiscordEvent} with full type inference on `args`. */
export function createEvent<K extends keyof ClientEvents>(event: DiscordEvent<K>): DiscordEvent<K> {
	return event;
}
