import { Client, Events } from "discord.js";
import { vi } from "vitest";

/**
 * A real discord.js {@link Client} that never reaches Discord: `login` resolves
 * the token without opening the gateway, and `login` and `destroy` are spies.
 */
export function createFakeClient(): Client {
	const client = new Client({ intents: [] });
	vi.spyOn(client, "login").mockImplementation(async (token) => token ?? "");
	vi.spyOn(client, "destroy").mockResolvedValue();
	return client;
}

/** Emit `clientReady` on `client`, as the gateway does once the login completed. */
export function emitReady(client: Client): void {
	client.emit(Events.ClientReady, client as Client<true>);
}
