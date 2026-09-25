import type { Client, ClientEvents } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { createEvent } from "@/discord/events/create-event";
import { EventRouter } from "@/discord/events/event-router";
import type { EventListener } from "@/discord/events/types";
import { createFakeLogger } from "../../support/fake-logger";

interface Binding {
	name: keyof ClientEvents;
	kind: "on" | "once";
	listener: EventListener;
}

/**
 * A stand-in for the discord.js client: it only records what the router bound,
 * which is the entire observable behaviour of `bind`.
 */
function createFakeClient(): { client: Client; bindings: Binding[] } {
	const bindings: Binding[] = [];
	const client = {
		on(name: keyof ClientEvents, listener: EventListener) {
			bindings.push({ name, kind: "on", listener });
			return this;
		},
		once(name: keyof ClientEvents, listener: EventListener) {
			bindings.push({ name, kind: "once", listener });
			return this;
		},
	} as unknown as Client;
	return { client, bindings };
}

/** Read a binding while keeping the test honest about what `bind` produced. */
function takeListener(bindings: Binding[], index: number): EventListener {
	const binding = bindings[index];
	if (!binding) {
		throw new Error(`No binding at index ${index}`);
	}
	return binding.listener;
}

describe("EventRouter", () => {
	it("binds registered events with on, or once when the flag is set", () => {
		const { client, bindings } = createFakeClient();
		const router = new EventRouter(createFakeLogger());

		router
			.register(createEvent({ name: "guildCreate", execute() {} }))
			.registerAll([createEvent({ name: "clientReady", once: true, execute() {} })]);
		router.bind(client);

		expect(bindings.map(({ name, kind }) => ({ name, kind }))).toEqual([
			{ name: "guildCreate", kind: "on" },
			{ name: "clientReady", kind: "once" },
		]);
	});

	it("forwards the gateway arguments to the handler", async () => {
		const { client, bindings } = createFakeClient();
		const execute = vi.fn();
		const router = new EventRouter(createFakeLogger());

		router.register(createEvent({ name: "guildCreate", execute }));
		router.bind(client);
		await takeListener(bindings, 0)(...([{ id: "42" }] as unknown as ClientEvents["guildCreate"]));

		expect(execute).toHaveBeenCalledWith({ id: "42" });
	});

	it("logs a throwing handler instead of rethrowing", async () => {
		const { client, bindings } = createFakeClient();
		const logger = createFakeLogger();
		const router = new EventRouter(logger);

		router.register(
			createEvent({
				name: "guildCreate",
				execute() {
					throw new Error("boom");
				},
			}),
		);
		router.bind(client);

		await expect(
			takeListener(bindings, 0)(...([] as unknown as ClientEvents["guildCreate"])),
		).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith(
			{ event: "guildCreate", err: "boom" },
			"Event handler failed",
		);
	});

	it("logs a rejected promise from an async handler", async () => {
		const { client, bindings } = createFakeClient();
		const logger = createFakeLogger();
		const router = new EventRouter(logger);

		router.register(
			createEvent({
				name: "guildCreate",
				execute: () => Promise.reject("plain rejection"),
			}),
		);
		router.bind(client);
		await takeListener(bindings, 0)(...([] as unknown as ClientEvents["guildCreate"]));

		expect(logger.error).toHaveBeenCalledWith(
			{ event: "guildCreate", err: "plain rejection" },
			"Event handler failed",
		);
	});
});
