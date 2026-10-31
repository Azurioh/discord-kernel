import { Routes } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { createBot } from "@/bot/create-bot";
import { createInMemoryDeployRest } from "@/discord/command/in-memory-deploy-rest";
import { createInMemoryLogger } from "@/in-memory-logger";
import { createInMemoryDatabase } from "@/persistence/in-memory-database";
import { createInMemoryMigrationRunner } from "@/persistence/in-memory-migration-runner";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { createFakeClient } from "../support/fake-client";

const CLIENT_ID = "100000000000000001";

function command(name: string) {
	return { data: { name, toJSON: () => ({ name }) }, dispatch: vi.fn(async () => undefined) };
}

describe("bot.deployCommands", () => {
	it("deploys static and built slash/context-menu commands without starting anything", async () => {
		const client = createFakeClient();
		const database = createInMemoryDatabase();
		const up = vi.fn();
		const setup = vi.fn();
		const builtSetup = vi.fn();
		const rest = createInMemoryDeployRest();
		const bot = createBot({
			logger: createInMemoryLogger(),
			settingsStore: createInMemorySettingsStore(),
			discord: { client },
			adapters: {
				databases: [database],
				migrations: createInMemoryMigrationRunner([{ id: "one", up }]),
			},
			modules: [
				{ name: "static", commands: [command("ping")], setup },
				{
					name: "built",
					build: () => ({
						commands: [command("built")],
						contextMenuCommands: [command("Inspect")],
						setup: builtSetup,
					}),
				},
			],
		});
		await expect(bot.deployCommands({ token: "unused", clientId: CLIENT_ID, rest })).resolves.toBe(
			3,
		);
		expect(rest.requests).toEqual([
			{
				route: Routes.applicationCommands(CLIENT_ID),
				body: [{ name: "ping" }, { name: "built" }, { name: "Inspect" }],
			},
		]);
		expect(client.login).not.toHaveBeenCalled();
		expect(database.connectCount).toBe(0);
		expect(up).not.toHaveBeenCalled();
		expect(setup).not.toHaveBeenCalled();
		expect(builtSetup).not.toHaveBeenCalled();
	});
});
