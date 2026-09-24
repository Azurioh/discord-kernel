import { createEvent } from "@azurioh/discord-kernel/discord/events/create-event";
import type { DiscordEvent } from "@azurioh/discord-kernel/discord/events/types";
import type { Logger } from "@azurioh/discord-kernel/logger";
import { createReadyHandler } from "@/modules/basics/events/lifecycle/ready.handler";

/** `clientReady`, once per process. */
export function createReadyEvent(logger: Logger): DiscordEvent<"clientReady"> {
	return createEvent({ name: "clientReady", once: true, execute: createReadyHandler(logger) });
}
