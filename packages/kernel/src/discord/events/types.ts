import type { ClientEvents } from "discord.js";

/**
 * A typed Discord gateway event handler. `name` is keyed to discord.js'
 * {@link ClientEvents}, so `args` are inferred per event with no `any`.
 */
export interface DiscordEvent<K extends keyof ClientEvents = keyof ClientEvents> {
	readonly name: K;
	readonly once?: boolean;
	execute(...args: ClientEvents[K]): Promise<void> | void;
}

/**
 * The listener actually handed to discord.js. It is type-erased over every event
 * name because the router holds heterogeneous events in a single collection.
 */
export type EventListener = (...args: ClientEvents[keyof ClientEvents]) => Promise<void>;
