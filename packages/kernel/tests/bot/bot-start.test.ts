import { Events } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BotOptions, createBot } from "@/bot/create-bot";
import { createInMemoryProcess } from "@/bot/in-memory-process";
import { createEvent } from "@/discord/events/create-event";
import { CORE_MESSAGES } from "@/discord/i18n";
import type { BotModule } from "@/module/module";
import { createInMemoryDatabase } from "@/persistence/in-memory-database";
import { createInMemoryMigrationRunner } from "@/persistence/in-memory-migration-runner";
import { createInMemoryScheduler } from "@/scheduler/in-memory-scheduler";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { createBotInteraction, dispatchClientEvent } from "../support/bot-interaction";
import { createDeferred } from "../support/deferred";
import { createFakeClient, emitReady } from "../support/fake-client";
import { createFakeLogger } from "../support/fake-logger";

function input(modules: readonly BotModule[]): BotOptions {
	const client = createFakeClient();
	vi.mocked(client.login).mockImplementation(async () => {
		emitReady(client);
		return "token";
	});
	return {
		modules,
		logger: createFakeLogger(),
		settingsStore: createInMemorySettingsStore(),
		discord: { client },
		adapters: { scheduler: createInMemoryScheduler() },
		lifecycle: { handleSignals: false, handleCrashes: false },
	};
}

afterEach(() => vi.useRealTimers());

describe("bot start", () => {
	it("preserves the startup error when unsubscribe throws during rollback", async () => {
		const original = new TypeError("original setup failure");
		const process = createInMemoryProcess();
		const opts = input([
			{
				name: "broken",
				setup: () => {
					throw original;
				},
			},
		]);
		const bot = createBot({
			...opts,
			lifecycle: { process },
			adapters: {
				...opts.adapters,
				notifier: {
					notify: vi.fn(),
					subscribe: () => () => {
						throw new TypeError("unsubscribe failed");
					},
				},
			},
		});
		await expect(bot.start("token")).rejects.toBe(original);
		expect(bot.state).toBe("stopped");
		for (const event of ["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"] as const) {
			expect(process.listenerCount(event)).toBe(0);
		}
	});
	it("connects, migrates, logs in, waits ready, sets up in order and schedules ready jobs", async () => {
		const order: string[] = [];
		const run = vi.fn();
		const opts = input([
			{
				name: "first",
				setup: () => {
					order.push("first");
				},
				jobs: [{ name: "boot", intervalMs: 1000, runOnStart: true, run }],
			},
			{
				name: "second",
				setup: () => {
					order.push("second");
				},
			},
		]);
		const db1 = createInMemoryDatabase("one");
		const db2 = createInMemoryDatabase("two");
		vi.spyOn(db1, "connect").mockImplementation(async () => {
			order.push("connect.one");
		});
		vi.spyOn(db2, "connect").mockImplementation(async () => {
			order.push("connect.two");
		});
		const migrations = createInMemoryMigrationRunner([
			{
				id: "first",
				up: () => {
					order.push("migrate");
				},
			},
		]);
		const scheduler = createInMemoryScheduler();
		vi.spyOn(scheduler, "start");
		const client = opts.discord?.client;
		if (client === undefined) {
			throw new TypeError("missing test client");
		}
		const ready = createDeferred<void>();
		vi.mocked(client.login).mockImplementation(async () => {
			order.push("login");
			await ready.promise;
			return "token";
		});
		const bot = createBot({ ...opts, adapters: { databases: [db1, db2], migrations, scheduler } });
		expect(bot.state).toBe("created");
		const starting = bot.start("secret");
		await vi.waitFor(() => expect(client.login).toHaveBeenCalledOnce());
		expect(bot.state).toBe("starting");
		expect(run).not.toHaveBeenCalled();
		ready.resolve();
		await Promise.resolve();
		expect(order).toEqual(["connect.one", "connect.two", "migrate", "login"]);
		emitReady(client);
		await starting;
		expect(order).toEqual(["connect.one", "connect.two", "migrate", "login", "first", "second"]);
		expect(scheduler.jobs.map((job) => job.name)).toEqual(["boot"]);
		expect(run).toHaveBeenCalledOnce();
		expect(bot.state).toBe("running");
		await bot.start("again");
		expect(client.login).toHaveBeenCalledOnce();
		expect(opts.logger.warn).toHaveBeenCalled();
		await bot.stop();
	});
	it("captures readiness emitted synchronously during login", async () => {
		const bot = createBot(input([]));
		await bot.start("token");
		expect(bot.state).toBe("running");
		expect(bot.client.listenerCount(Events.ClientReady)).toBe(0);
		await bot.stop();
	});
	it.each(["database", "migration", "login", "setup"])(
		"rolls back %s failure and preserves the original error",
		async (stage) => {
			const error = new TypeError("failed");
			const teardown = vi.fn();
			const opts = input([
				{ name: "ready", teardown },
				{
					name: "broken",
					setup: () => {
						if (stage === "setup") {
							throw error;
						}
					},
				},
			]);
			const first = createInMemoryDatabase("first");
			const second = createInMemoryDatabase("second");
			if (stage === "database") {
				second.failOnConnect(error);
			}
			const migrations = createInMemoryMigrationRunner([
				{
					id: "one",
					up: () => {
						if (stage === "migration") {
							throw error;
						}
					},
				},
			]);
			const client = opts.discord?.client;
			if (client === undefined) {
				throw new TypeError("missing client");
			}
			if (stage === "login") {
				vi.mocked(client.login).mockRejectedValue(error);
			}
			const bot = createBot({
				...opts,
				adapters: { ...opts.adapters, databases: [first, second], migrations },
			});
			await expect(bot.start("token")).rejects.toBe(error);
			expect(bot.state).toBe("stopped");
			expect(first.connected).toBe(false);
			expect(first.closeCount).toBe(1);
			expect(second.closeCount).toBe(stage === "database" ? 0 : 1);
			expect(client.listenerCount(Events.ClientReady)).toBe(0);
			expect(client.login).toHaveBeenCalledTimes(
				stage === "database" || stage === "migration" ? 0 : 1,
			);
			expect(client.destroy).toHaveBeenCalledTimes(
				stage === "database" || stage === "migration" ? 0 : 1,
			);
			expect(teardown).toHaveBeenCalledTimes(stage === "setup" ? 1 : 0);
		},
	);
	it("skips every handler kind and jobs for an unavailable ungated optional module", async () => {
		const dispatch = vi.fn();
		const autocomplete = vi.fn();
		const handle = vi.fn();
		const execute = vi.fn();
		const teardown = vi.fn();
		const opts = input([
			{
				name: "optional",
				gated: false,
				optional: true,
				setup: () => {
					throw new TypeError("optional");
				},
				teardown,
				commands: [{ data: { name: "test" }, dispatch, autocomplete }],
				contextMenuCommands: [{ data: { name: "test" }, dispatch }],
				components: [{ customId: "test", authorize: { kind: "anyone", because: "test" }, handle }],
				events: [createEvent({ name: Events.MessageCreate, execute })],
				jobs: [{ name: "skip", intervalMs: 1000, run: vi.fn() }],
			},
		]);
		const scheduler = createInMemoryScheduler();
		const bot = createBot({ ...opts, adapters: { scheduler } });
		await bot.start("token");
		for (const kind of [
			"slash",
			"contextMenu",
			"button",
			"selectMenu",
			"modal",
			"autocomplete",
		] as const) {
			const interaction = createBotInteraction({
				kind,
				name: "test",
				locale: "fr",
				guildId: "guild",
			});
			await dispatchClientEvent({
				client: bot.client,
				event: Events.InteractionCreate,
				args: [interaction],
			});
			if (kind === "autocomplete") {
				expect(interaction.respond).toHaveBeenCalledExactlyOnceWith([]);
			} else {
				expect(interaction.reply).toHaveBeenCalledWith(
					expect.objectContaining({
						embeds: [
							expect.objectContaining({
								data: expect.objectContaining({
									description: bot.translator.translate("fr", CORE_MESSAGES.moduleUnavailable),
								}),
							}),
						],
					}),
				);
			}
		}
		await dispatchClientEvent({
			client: bot.client,
			event: Events.MessageCreate,
			args: [{ guildId: "guild" }],
		});
		expect(dispatch).not.toHaveBeenCalled();
		expect(autocomplete).not.toHaveBeenCalled();
		expect(handle).not.toHaveBeenCalled();
		expect(execute).not.toHaveBeenCalled();
		expect(scheduler.jobs).toEqual([]);
		expect(bot.state).toBe("running");
		await bot.stop();
		expect(teardown).not.toHaveBeenCalled();
	});
	it("uses the default scheduler without leaving real or fake timers running", async () => {
		vi.useFakeTimers();
		const run = vi.fn();
		const opts = input([{ name: "timed", jobs: [{ name: "tick", intervalMs: 50, run }] }]);
		const bot = createBot({ ...opts, adapters: {} });
		await bot.start("token");
		await vi.advanceTimersByTimeAsync(50);
		expect(run).toHaveBeenCalledOnce();
		await bot.stop();
		expect(vi.getTimerCount()).toBe(0);
	});
});
