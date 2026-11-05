import type { Client } from "discord.js";
import { vi } from "vitest";
import type { Bot } from "@/bot/create-bot";
import { emitReady } from "./fake-client";

/** One payload an interaction fixture sent, with the method that sent it. */
interface SentPayload {
	readonly method: "reply" | "editReply" | "followUp" | "update";
	readonly payload: unknown;
}

/** An interaction fixture shared by bot integration tests.
 * @param params - Interaction kind, identity and locale.
 * @returns A reply-observable interaction without a Discord connection.
 */
export function createBotInteraction(params: {
	kind: "slash" | "contextMenu" | "button" | "selectMenu" | "modal" | "autocomplete";
	name: string;
	guildId: string;
	locale?: string;
}) {
	const sent: SentPayload[] = [];
	const interaction = {
		id: "900000000000000001",
		user: { id: "900000000000000002" },
		commandName: params.name,
		customId: params.name,
		guildId: params.guildId,
		locale: params.locale ?? "en",
		guildLocale: "en",
		deferred: false,
		replied: false,
		options: { getSubcommand: () => null, getSubcommandGroup: () => null },
		isChatInputCommand: () => params.kind === "slash",
		isContextMenuCommand: () => params.kind === "contextMenu",
		isAutocomplete: () => params.kind === "autocomplete",
		isButton: () => params.kind === "button",
		isAnySelectMenu: () => params.kind === "selectMenu",
		isModalSubmit: () => params.kind === "modal",
		reply: vi.fn(async (payload: unknown) => {
			sent.push({ method: "reply", payload });
			interaction.replied = true;
		}),
		deferReply: vi.fn(async (_payload?: unknown) => {
			interaction.deferred = true;
		}),
		editReply: vi.fn(async (payload: unknown) => {
			sent.push({ method: "editReply", payload });
			interaction.replied = true;
		}),
		followUp: vi.fn(async (payload: unknown) => {
			sent.push({ method: "followUp", payload });
			interaction.replied = true;
		}),
		update: vi.fn(async (payload: unknown) => {
			sent.push({ method: "update", payload });
			interaction.replied = true;
		}),
		respond: vi.fn(async (_payload: unknown) => undefined),
		/** Every payload sent through reply, editReply, followUp or update, in order. */
		sentPayloads: (): readonly SentPayload[] => [...sent],
	};
	return interaction;
}

/** Run bound client listeners and await their observable async completion.
 * @param params - Client, event name and gateway arguments.
 * @returns Resolves after all registered listeners complete.
 */
export async function dispatchClientEvent(params: {
	client: Client;
	event: string;
	args: readonly unknown[];
}): Promise<void> {
	await Promise.all(
		params.client
			.rawListeners(params.event)
			.map((listener) => Reflect.apply(listener, params.client, params.args)),
	);
}

/** Start a fake-client bot and deliver the gateway readiness event.
 * @param params - Bot and optional token used by the fake login.
 * @returns Resolves once startup has completed.
 * @throws When startup fails.
 */
export async function startFakeBot(params: { bot: Bot; token?: string }): Promise<void> {
	const starting = params.bot.start(params.token ?? "test-token");
	await vi.waitFor(() => expectLogin(params.bot.client));
	emitReady(params.bot.client);
	await starting;
}

function expectLogin(client: Client): void {
	if (vi.mocked(client.login).mock.calls.length === 0) {
		throw new TypeError("The fake client has not logged in yet");
	}
}
