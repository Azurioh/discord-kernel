import { afterEach, describe, expect, it, vi } from "vitest";
import { type BotOptions, createBot } from "@/bot/create-bot";
import { createInMemoryProcess } from "@/bot/in-memory-process";
import type { BotModule } from "@/module/module";
import { createInMemoryDatabase } from "@/persistence/in-memory-database";
import { createInMemoryScheduler } from "@/scheduler/in-memory-scheduler";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import type { SettingsChangedNotifier } from "@/settings/ports/settings-changed-notifier";
import { createDeferred } from "../support/deferred";
import { createFakeClient, emitReady } from "../support/fake-client";
import { createFakeLogger } from "../support/fake-logger";

function fixture(params: {
	modules?: readonly BotModule[];
	lifecycle?: BotOptions["lifecycle"];
	notifier?: SettingsChangedNotifier;
}) {
	const client = createFakeClient();
	vi.mocked(client.login).mockImplementation(async () => {
		emitReady(client);
		return "token";
	});
	const logger = createFakeLogger();
	const scheduler = createInMemoryScheduler();
	const process = createInMemoryProcess();
	const first = createInMemoryDatabase("first");
	const second = createInMemoryDatabase("second");
	const notifier = params.notifier ?? createInProcessNotifier(logger);
	const bot = createBot({
		modules: params.modules ?? [],
		logger,
		settingsStore: createInMemorySettingsStore(),
		discord: { client },
		adapters: { scheduler, databases: [first, second], notifier },
		lifecycle: { process, ...params.lifecycle },
	});
	return { bot, client, logger, scheduler, process, first, second, notifier };
}

afterEach(() => vi.useRealTimers());

describe("bot stop", () => {
	it.each(["completed", "failed", "abandoned"] as const)(
		"joins a late module cleanup before dependencies close (%s)",
		async (outcome) => {
			vi.useFakeTimers();
			const setup = createDeferred<void>();
			const setupEntered = createDeferred<void>();
			const readyCleanup = createDeferred<void>();
			const lateCleanup = createDeferred<void>();
			const lateEntered = createDeferred<void>();
			const f = fixture({
				modules: [
					{ name: "ready", teardown: () => readyCleanup.promise },
					{
						name: "late",
						setup: () => {
							setupEntered.resolve();
							return setup.promise;
						},
						teardown: () => {
							lateEntered.resolve();
							return lateCleanup.promise;
						},
					},
				],
				lifecycle: { shutdownTimeoutMs: 100 },
			});
			const starting = f.bot.start("token");
			await setupEntered.promise;
			const since = Date.now();
			const stopping = f.bot.stop();
			await vi.advanceTimersByTimeAsync(100);
			setup.resolve();
			await lateEntered.promise;
			readyCleanup.resolve();
			await vi.advanceTimersByTimeAsync(10);
			expect(f.first.closeCount).toBe(0);
			expect(f.second.closeCount).toBe(0);
			expect(f.client.destroy).not.toHaveBeenCalled();
			if (outcome === "completed") {
				lateCleanup.resolve();
			} else if (outcome === "failed") {
				lateCleanup.reject(new TypeError("late teardown failed"));
			}
			await vi.advanceTimersByTimeAsync(990);
			const report = await stopping;
			await starting;
			expect(report.failed).toEqual(
				outcome === "failed"
					? [{ step: "module.teardown", target: "late", error: "late teardown failed" }]
					: [],
			);
			expect(report.abandoned).toEqual(
				outcome === "abandoned"
					? expect.arrayContaining([
							{ step: "start.settle" },
							{ step: "module.teardown", target: "late" },
						])
					: [{ step: "start.settle" }],
			);
			expect(f.logger.info).toHaveBeenCalledWith(
				expect.objectContaining({ step: "module.teardown", target: "ready", outcome: "ok" }),
				expect.any(String),
			);
			expect(f.first.closeCount).toBe(1);
			expect(f.second.closeCount).toBe(1);
			expect(f.client.destroy).toHaveBeenCalledOnce();
			expect(Date.now() - since).toBeLessThanOrEqual(1100);
			expect(vi.getTimerCount()).toBe(0);
		},
	);
	it("records a throwing unsubscribe and always removes process handlers", async () => {
		const unsubscribe = vi.fn(() => {
			throw new TypeError("unsubscribe failed");
		});
		const f = fixture({ notifier: { notify: vi.fn(), subscribe: () => unsubscribe } });
		await f.bot.start("token");
		expect(f.process.listenerCount("SIGTERM")).toBe(1);
		await expect(f.bot.stop()).resolves.toEqual({
			ok: false,
			reason: "manual",
			failed: [{ step: "settings.unsubscribe", error: "unsubscribe failed" }],
			abandoned: [],
		});
		expect(f.bot.state).toBe("stopped");
		expect(unsubscribe).toHaveBeenCalledOnce();
		expect(f.logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ step: "settings.unsubscribe", error: "unsubscribe failed" }),
			expect.any(String),
		);
		for (const event of ["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"] as const) {
			expect(f.process.listenerCount(event)).toBe(0);
		}
	});
	it.each([false, true])(
		"closes a late database exactly once (after shutdown: %s)",
		async (afterShutdown) => {
			vi.useFakeTimers();
			const pending = createDeferred<void>();
			const entered = createDeferred<void>();
			const f = fixture({ lifecycle: { shutdownTimeoutMs: 100 } });
			const connect = f.first.connect.bind(f.first);
			vi.spyOn(f.first, "connect").mockImplementation(async () => {
				entered.resolve();
				await pending.promise;
				await connect();
			});
			const schedule = vi.spyOn(f.scheduler, "start");
			const starting = f.bot.start("token");
			await entered.promise;
			const stopping = f.bot.stop();
			if (afterShutdown) {
				await vi.advanceTimersByTimeAsync(1100);
				await stopping;
			}
			pending.resolve();
			await vi.advanceTimersByTimeAsync(0);
			await starting;
			expect(f.first.closeCount).toBe(1);
			expect(f.first.connected).toBe(false);
			expect(f.second.connectCount).toBe(0);
			expect(f.client.login).not.toHaveBeenCalled();
			expect(schedule).not.toHaveBeenCalled();
			expect(f.bot.state).toBe("stopped");
			expect(await stopping).toEqual({
				ok: !afterShutdown,
				reason: "manual",
				failed: [],
				abandoned: afterShutdown ? [{ step: "start.settle" }] : [],
			});
			expect(f.bot.stop()).toBe(stopping);
			expect(vi.getTimerCount()).toBe(0);
		},
	);
	it.each([false, true])("destroys a late login (after shutdown: %s)", async (afterShutdown) => {
		vi.useFakeTimers();
		const pending = createDeferred<void>();
		const entered = createDeferred<void>();
		const f = fixture({ lifecycle: { shutdownTimeoutMs: 100 } });
		let connected = false;
		vi.mocked(f.client.login).mockImplementation(async () => {
			entered.resolve();
			await pending.promise;
			connected = true;
			emitReady(f.client);
			return "token";
		});
		vi.mocked(f.client.destroy).mockImplementation(async () => {
			connected = false;
		});
		const schedule = vi.spyOn(f.scheduler, "start");
		const starting = f.bot.start("token");
		await entered.promise;
		const stopping = f.bot.stop();
		if (afterShutdown) {
			await vi.advanceTimersByTimeAsync(1100);
			await stopping;
		}
		pending.resolve();
		await vi.advanceTimersByTimeAsync(0);
		await starting;
		expect(connected).toBe(false);
		expect(f.client.destroy).toHaveBeenCalledTimes(afterShutdown ? 2 : 1);
		expect(schedule).not.toHaveBeenCalled();
		expect(f.bot.state).toBe("stopped");
		expect(await stopping).toEqual({
			ok: !afterShutdown,
			reason: "manual",
			failed: [],
			abandoned: afterShutdown ? [{ step: "start.settle" }] : [],
		});
		expect(vi.getTimerCount()).toBe(0);
	});
	it.each([false, true])(
		"tears down a late successful setup (after shutdown: %s)",
		async (afterShutdown) => {
			vi.useFakeTimers();
			const pending = createDeferred<void>();
			const entered = createDeferred<void>();
			const teardown = vi.fn();
			const later = vi.fn();
			const f = fixture({
				modules: [
					{
						name: "pending",
						setup: () => {
							entered.resolve();
							return pending.promise;
						},
						teardown,
					},
					{ name: "later", setup: later },
				],
				lifecycle: { shutdownTimeoutMs: 100 },
			});
			const schedule = vi.spyOn(f.scheduler, "start");
			const starting = f.bot.start("token");
			await entered.promise;
			const stopping = f.bot.stop();
			if (afterShutdown) {
				await vi.advanceTimersByTimeAsync(1100);
				await stopping;
				expect(teardown).not.toHaveBeenCalled();
			}
			pending.resolve();
			await vi.advanceTimersByTimeAsync(0);
			await starting;
			expect(teardown).toHaveBeenCalledOnce();
			expect(later).not.toHaveBeenCalled();
			expect(schedule).not.toHaveBeenCalled();
			expect(f.bot.state).toBe("stopped");
			expect(await stopping).toEqual({
				ok: !afterShutdown,
				reason: "manual",
				failed: [],
				abandoned: afterShutdown ? [{ step: "start.settle" }] : [],
			});
			expect(vi.getTimerCount()).toBe(0);
		},
	);

	it("stops jobs, tears down all ready modules in reverse, closes databases in reverse, destroys, then flushes", async () => {
		const order: string[] = [];
		const f = fixture({
			modules: [
				{
					name: "first",
					teardown: () => {
						order.push("first");
					},
				},
				{
					name: "second",
					setup: vi.fn(),
					teardown: () => {
						order.push("second");
					},
				},
			],
			lifecycle: {
				flushes: [
					{
						name: "one",
						flush: () => {
							order.push("flush.one");
						},
					},
					{
						name: "two",
						flush: () => {
							order.push("flush.two");
						},
					},
				],
			},
		});
		vi.spyOn(f.scheduler, "stop").mockImplementation(() => {
			order.push("jobs");
		});
		vi.spyOn(f.second, "close").mockImplementation(async () => {
			order.push("db.second");
		});
		vi.spyOn(f.first, "close").mockImplementation(async () => {
			order.push("db.first");
		});
		vi.mocked(f.client.destroy).mockImplementation(async () => {
			order.push("destroy");
		});
		await f.bot.start("token");
		const stopping = f.bot.stop();
		expect(f.bot.stop()).toBe(stopping);
		expect(await stopping).toEqual({ ok: true, reason: "manual", failed: [], abandoned: [] });
		expect(f.bot.stop()).toBe(stopping);
		expect(order).toEqual([
			"jobs",
			"second",
			"first",
			"db.second",
			"db.first",
			"destroy",
			"flush.one",
			"flush.two",
		]);
		expect(f.bot.state).toBe("stopped");
		expect(f.process.exits).toEqual([]);
		for (const event of ["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"] as const) {
			expect(f.process.listenerCount(event)).toBe(0);
		}
	});
	it("continues after failed teardown and flush, reporting each field", async () => {
		const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		const f = fixture({
			modules: [
				{
					name: "broken",
					teardown: () => {
						throw new TypeError("teardown failed");
					},
				},
			],
			lifecycle: {
				flushes: [
					{
						name: "broken",
						flush: () => {
							throw new TypeError("flush failed");
						},
					},
				],
			},
		});
		await f.bot.start("token");
		expect(await f.bot.stop()).toEqual({
			ok: false,
			reason: "manual",
			failed: [
				{ step: "module.teardown", target: "broken", error: "teardown failed" },
				{ step: "flush", target: "broken", error: "flush failed" },
			],
			abandoned: [],
		});
		expect(f.first.closeCount).toBe(1);
		expect(f.client.destroy).toHaveBeenCalledOnce();
		expect(f.logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ step: "module.teardown", target: "broken" }),
			expect.any(String),
		);
		expect(stderr).toHaveBeenCalledWith(expect.stringContaining("flush failed"));
		stderr.mockRestore();
	});
	it("shares one grace deadline across several hanging stop steps", async () => {
		vi.useFakeTimers();
		const hang = () => new Promise<void>(() => {});
		const f = fixture({
			modules: [{ name: "hung", teardown: hang }],
			lifecycle: { shutdownTimeoutMs: 100, flushes: [{ name: "hung", flush: hang }] },
		});
		vi.spyOn(f.second, "close").mockImplementation(hang);
		vi.mocked(f.client.destroy).mockImplementation(hang);
		await f.bot.start("token");
		const since = Date.now();
		const stopping = f.bot.stop();
		await vi.advanceTimersByTimeAsync(1100);
		expect(await stopping).toEqual({
			ok: false,
			reason: "manual",
			failed: [],
			abandoned: [
				{ step: "module.teardown", target: "hung" },
				{ step: "databases.close", target: "second" },
				{ step: "gateway.destroy" },
				{ step: "flush", target: "hung" },
			],
		});
		expect(Date.now() - since).toBeLessThanOrEqual(1100);
		expect(f.first.closeCount).toBe(1);
		expect(f.client.destroy).toHaveBeenCalledOnce();
		expect(f.process.exits).toEqual([]);
		expect(vi.getTimerCount()).toBe(0);
	});
	it("stops before start without acquiring resources or installing handlers", async () => {
		const teardown = vi.fn();
		const f = fixture({ modules: [{ name: "pending", teardown }] });
		expect(await f.bot.stop()).toEqual({ ok: true, reason: "manual", failed: [], abandoned: [] });
		expect(teardown).not.toHaveBeenCalled();
		expect(f.first.closeCount).toBe(0);
		expect(f.client.destroy).not.toHaveBeenCalled();
		expect(f.client.login).not.toHaveBeenCalled();
		await f.bot.start("late");
		expect(f.client.login).not.toHaveBeenCalled();
	});
	it("waits for a pending setup, releases ready modules, and never schedules later start steps", async () => {
		const pending = createDeferred<void>();
		const entered = createDeferred<void>();
		const readyTeardown = vi.fn();
		const lateTeardown = vi.fn();
		const laterSetup = vi.fn();
		const f = fixture({
			modules: [
				{ name: "ready", teardown: readyTeardown },
				{
					name: "pending",
					setup: () => {
						entered.resolve();
						return pending.promise;
					},
					teardown: lateTeardown,
				},
				{ name: "later", setup: laterSetup },
			],
		});
		const starting = f.bot.start("token");
		await entered.promise;
		const stopping = f.bot.stop();
		expect(f.bot.state).toBe("stopping");
		pending.resolve();
		expect(await starting).toBeUndefined();
		expect(await stopping).toEqual({ ok: true, reason: "manual", failed: [], abandoned: [] });
		expect(readyTeardown).toHaveBeenCalledOnce();
		expect(lateTeardown).toHaveBeenCalledOnce();
		expect(laterSetup).not.toHaveBeenCalled();
		expect(f.scheduler.started).toBe(false);
		expect(f.bot.state).toBe("stopped");
		expect(f.first.closeCount).toBe(1);
		expect(f.client.destroy).toHaveBeenCalledOnce();
	});
	it("settles interrupted start after abandoning pending setup and releases its late acquisition", async () => {
		vi.useFakeTimers();
		const pending = createDeferred<void>();
		const entered = createDeferred<void>();
		const later = vi.fn();
		const teardown = vi.fn();
		const f = fixture({
			modules: [
				{
					name: "pending",
					setup: () => {
						entered.resolve();
						return pending.promise;
					},
					teardown,
				},
				{ name: "later", setup: later },
			],
			lifecycle: { shutdownTimeoutMs: 100 },
		});
		let startSettled = false;
		const starting = f.bot.start("token").then(() => {
			startSettled = true;
		});
		await entered.promise;
		const stopping = f.bot.stop();
		await vi.advanceTimersByTimeAsync(1100);
		expect(await stopping).toEqual({
			ok: false,
			reason: "manual",
			failed: [],
			abandoned: [{ step: "start.settle" }],
		});
		expect(startSettled).toBe(true);
		await starting;
		pending.resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(later).not.toHaveBeenCalled();
		expect(teardown).toHaveBeenCalledOnce();
		expect(f.scheduler.started).toBe(false);
		expect(f.bot.state).toBe("stopped");
	});
	it.each(["created", "running", "failed"] as const)(
		"releases the settings subscription after stopping a %s bot",
		async (stage) => {
			const logger = createFakeLogger();
			const notifier = createInProcessNotifier(logger);
			const unsubscribe = vi.fn();
			const original = notifier.subscribe.bind(notifier);
			const subscribe = vi.spyOn(notifier, "subscribe");
			subscribe.mockImplementation((listener) => {
				const release = original(listener);
				return () => {
					unsubscribe();
					release();
				};
			});
			const client = createFakeClient();
			vi.mocked(client.login).mockImplementation(async () => {
				emitReady(client);
				return "token";
			});
			if (stage === "failed") {
				vi.mocked(client.login).mockRejectedValue(new TypeError("login"));
			}
			const bot = createBot({
				modules: [],
				logger,
				settingsStore: createInMemorySettingsStore(),
				adapters: { notifier, scheduler: createInMemoryScheduler() },
				discord: { client },
				lifecycle: { handleSignals: false, handleCrashes: false },
			});
			expect(subscribe).toHaveBeenCalledOnce();
			if (stage === "running") {
				await bot.start("token");
			}
			if (stage === "failed") {
				await expect(bot.start("token")).rejects.toThrow("login");
			}
			await bot.stop();
			expect(unsubscribe).toHaveBeenCalledOnce();
		},
	);
});
