import type { Client } from "discord.js";
import type { DiscordEvent, EventListener } from "@/discord/events/types";
import type { Logger } from "@/logger";

/**
 * Wrap a handler so a thrown error is logged instead of escaping to the
 * process-level `error` event: a failing handler must never take the bot down.
 */
function createEventListener(event: DiscordEvent, logger: Logger): EventListener {
	return async (...args) => {
		try {
			await event.execute(...args);
		} catch (error) {
			logger.error(
				{ event: event.name, err: error instanceof Error ? error.message : String(error) },
				"Event handler failed",
			);
		}
	};
}

/**
 * Binds registered {@link DiscordEvent}s to a client. This is the only place in
 * the app that calls `client.on`/`client.once`.
 */
export class EventRouter {
	private readonly events: DiscordEvent[] = [];

	constructor(private readonly logger: Logger) {}

	register(event: DiscordEvent): this {
		this.events.push(event);
		return this;
	}

	registerAll(events: Iterable<DiscordEvent>): this {
		for (const event of events) {
			this.register(event);
		}
		return this;
	}

	bind(client: Client): void {
		for (const event of this.events) {
			const listener = createEventListener(event, this.logger);
			if (event.once) {
				client.once(event.name, listener);
			} else {
				client.on(event.name, listener);
			}
		}
	}
}
