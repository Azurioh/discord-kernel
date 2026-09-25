import type { Client } from "discord.js";
import { eventGuildId } from "@/discord/events/event-guild-id";
import type { DiscordEvent, EventListener } from "@/discord/events/types";
import { isModuleDisabled } from "@/discord/settings/is-module-disabled";
import { errorMessage } from "@/errors/error-message";
import type { Logger } from "@/logger";
import type { ModuleGate } from "@/settings/system/module-gate";

/** A registered event and the module it belongs to, if any. */
interface RegisteredEvent {
	readonly event: DiscordEvent;
	readonly moduleName: string | undefined;
}

/**
 * Wrap a handler so a thrown error is logged instead of escaping to the
 * process-level `error` event: a failing handler must never take the bot down.
 * A handler of a module disabled on the event's guild is skipped silently.
 */
function createEventListener(params: {
	registered: RegisteredEvent;
	logger: Logger;
	gate: ModuleGate | undefined;
}): EventListener {
	const { registered, logger, gate } = params;
	const { event, moduleName } = registered;
	return async (...args) => {
		try {
			if (await isModuleDisabled({ gate, moduleName, guildId: eventGuildId(args) })) {
				return;
			}
			await event.execute(...args);
		} catch (error) {
			logger.error({ event: event.name, err: errorMessage(error) }, "Event handler failed");
		}
	};
}

/**
 * Binds registered {@link DiscordEvent}s to a client. This is the only place in
 * the app that calls `client.on`/`client.once`.
 */
export class EventRouter {
	private readonly events: RegisteredEvent[] = [];

	/**
	 * @param logger - where a failing handler is reported.
	 * @param gate - when given, a handler registered with a module is skipped,
	 * silently, for a guild where that module is disabled (FR-036). Events bound
	 * to no guild always run.
	 */
	constructor(
		private readonly logger: Logger,
		private readonly gate?: ModuleGate,
	) {}

	/**
	 * @param moduleName - the module the handler belongs to, so the gate can
	 * skip it for guilds where that module is disabled. Omit it for a handler
	 * that always runs.
	 */
	register(event: DiscordEvent, moduleName?: string): this {
		this.events.push({ event, moduleName });
		return this;
	}

	/** Register many handlers at once, all of `moduleName` when given. */
	registerAll(events: Iterable<DiscordEvent>, moduleName?: string): this {
		for (const event of events) {
			this.register(event, moduleName);
		}
		return this;
	}

	bind(client: Client): void {
		for (const registered of this.events) {
			const { event } = registered;
			const listener = createEventListener({ registered, logger: this.logger, gate: this.gate });
			if (event.once) {
				client.once(event.name, listener);
			} else {
				client.on(event.name, listener);
			}
		}
	}
}
