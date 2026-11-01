// Every imported kernel module has an explicit public package export.

import { describe, expect, it } from "vitest";
import { createBot } from "@/bot/create-bot";
import { createInMemoryProcess } from "@/bot/in-memory-process";
import { createCommand } from "@/discord/command/create-command";
import { createInMemoryLogger } from "@/in-memory-logger";
import { createInMemoryScheduler } from "@/scheduler/in-memory-scheduler";
import {
	createBotInteraction,
	dispatchClientEvent,
	startFakeBot,
} from "../support/bot-interaction";
import { createFakeClient } from "../support/fake-client";
import { publicEntrySource } from "../support/public-entry";

const ping = {
	name: "ping",
	commands: [
		createCommand({
			name: "ping",
			description: "Check availability",
			handler: async (context) => {
				await context.confirm("Pong");
			},
		}),
	],
};

describe("minimal bot", () => {
	it("starts, serves an interaction and stops using public exports", async () => {
		const { createInMemorySettingsStore } = await import(publicEntrySource("./settings"));
		const bot = createBot({
			modules: [ping],
			logger: createInMemoryLogger(),
			settingsStore: createInMemorySettingsStore(),
			discord: { client: createFakeClient() },
			adapters: { scheduler: createInMemoryScheduler() },
			lifecycle: { process: createInMemoryProcess() },
		});
		await startFakeBot({ bot });
		expect(bot.state).toBe("running");
		const interaction = createBotInteraction({
			kind: "slash",
			name: "ping",
			guildId: "100000000000000001",
		});
		await dispatchClientEvent({
			client: bot.client,
			event: "interactionCreate",
			args: [interaction],
		});
		expect(interaction.reply).toHaveBeenCalledOnce();
		expect(await bot.stop()).toEqual({ ok: true, reason: "manual", failed: [], abandoned: [] });
		expect(bot.state).toBe("stopped");
	});
});
