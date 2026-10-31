import type { Client } from "discord.js";
import { vi } from "vitest";

/** An interaction fixture shared by bot integration tests.
 * @param params - Interaction kind, identity and locale.
 * @returns A reply-observable interaction without a Discord connection.
 */
export function createBotInteraction(params: {
	kind: "slash" | "contextMenu" | "button" | "autocomplete";
	name: string;
	guildId: string;
	locale?: string;
}) {
	return {
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
		isAnySelectMenu: () => false,
		isModalSubmit: () => false,
		reply: vi.fn(async (_payload: unknown) => undefined),
		respond: vi.fn(async (_payload: unknown) => undefined),
	};
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
