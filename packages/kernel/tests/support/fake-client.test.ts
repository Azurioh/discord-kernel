import { Client, Events } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { createFakeClient, emitReady } from "./fake-client";

describe("createFakeClient", () => {
	it("is a real discord.js client", () => {
		expect(createFakeClient()).toBeInstanceOf(Client);
	});

	it("resolves login with the token without connecting", async () => {
		const client = createFakeClient();

		await expect(client.login("token")).resolves.toBe("token");
		expect(client.login).toHaveBeenCalledWith("token");
		expect(client.ws.status).not.toBe(0);
	});

	it("spies on destroy", async () => {
		const client = createFakeClient();

		await client.destroy();

		expect(client.destroy).toHaveBeenCalledTimes(1);
	});

	it("emits clientReady on demand", () => {
		const client = createFakeClient();
		const listener = vi.fn();
		client.once(Events.ClientReady, listener);

		emitReady(client);

		expect(listener).toHaveBeenCalledTimes(1);
	});
});
