import { createEvent } from "@azurioh/discord-kernel/discord/events/create-event";
import type { DiscordEvent } from "@azurioh/discord-kernel/discord/events/types";
import type { Logger } from "@azurioh/discord-kernel/logger";
import { createGuildCreateHandler } from "@/modules/basics/events/lifecycle/guild-create.handler";

/** `guildCreate`, on every join. */
export function createGuildCreateEvent(logger: Logger): DiscordEvent<"guildCreate"> {
	return createEvent({ name: "guildCreate", execute: createGuildCreateHandler(logger) });
}
