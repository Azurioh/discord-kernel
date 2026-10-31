import { describe, expect, it, vi } from "vitest";
import { createBot } from "@/bot/create-bot";
import { createInMemoryProcess } from "@/bot/in-memory-process";
import { installProcessHandlers } from "@/bot/process-handlers";
import type { ProcessEvent } from "@/bot/process-like";
import type { StopReport } from "@/bot/stop-report";
import type { BotModule } from "@/module/module";
import { createInMemoryScheduler } from "@/scheduler/in-memory-scheduler";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { startFakeBot } from "../support/bot-interaction";
import { createDeferred } from "../support/deferred";
import { createFakeClient } from "../support/fake-client";
import { createFakeLogger } from "../support/fake-logger";

const EVENTS: readonly ProcessEvent[] = [
	"SIGINT",
	"SIGTERM",
	"uncaughtException",
	"unhandledRejection",
];
const SIGNAL_REPORT: StopReport = {
	ok: true,
	reason: "signal",
	signal: "SIGTERM",
	failed: [],
	abandoned: [],
};

function processBot(modules: readonly BotModule[]) {
	const process = createInMemoryProcess();
	const logger = createFakeLogger();
	const client = createFakeClient();
	const bot = createBot({
		modules,
		logger,
		settingsStore: createInMemorySettingsStore(),
		discord: { client },
		adapters: { scheduler: createInMemoryScheduler() },
		lifecycle: { process },
	});
	return { bot, process, logger, client };
}

describe("bot process integration", () => {
	it("exits 1 after an ordinary failed teardown on a signal and removes all handlers", async () => {
		const f = processBot([
			{
				name: "failed",
				teardown: () => {
					throw new TypeError("teardown failed");
				},
			},
		]);
		await startFakeBot({ bot: f.bot });
		f.process.emit("SIGTERM");
		await vi.waitFor(() => expect(f.process.exits).toEqual([1]));
		expect(await f.bot.stop()).toEqual({
			ok: false,
			reason: "signal",
			signal: "SIGTERM",
			failed: [{ step: "module.teardown", target: "failed", error: "teardown failed" }],
			abandoned: [],
		});
		for (const event of EVENTS) {
			expect(f.process.listenerCount(event)).toBe(0);
		}
	});

	it("runs one teardown and exits once when a crash interrupts signal shutdown", async () => {
		const pending = createDeferred<void>();
		const teardown = vi.fn(() => pending.promise);
		const f = processBot([{ name: "pending", teardown }]);
		await startFakeBot({ bot: f.bot });
		f.process.emit("SIGTERM");
		await vi.waitFor(() => expect(teardown).toHaveBeenCalledOnce());
		f.process.emit("uncaughtException", new TypeError("crash"));
		f.process.emit("SIGINT");
		pending.resolve();
		await vi.waitFor(() => expect(f.process.exits).toEqual([1]));
		expect(teardown).toHaveBeenCalledOnce();
		expect(f.logger.fatal).toHaveBeenCalledOnce();
		expect(f.client.destroy).toHaveBeenCalledOnce();
		for (const event of EVENTS) {
			expect(f.process.listenerCount(event)).toBe(0);
		}
	});

	it.each(["manual", "failed start"] as const)(
		"removes every handler after %s without exiting",
		async (path) => {
			const f = processBot([]);
			if (path === "failed start") {
				vi.mocked(f.client.login).mockImplementation(async () => {
					for (const event of EVENTS) {
						expect(f.process.listenerCount(event)).toBe(1);
					}
					throw new TypeError("login failed");
				});
				await expect(f.bot.start("token")).rejects.toThrow("login failed");
			} else {
				await startFakeBot({ bot: f.bot });
				for (const event of EVENTS) {
					expect(f.process.listenerCount(event)).toBe(1);
				}
				await f.bot.stop();
			}
			for (const event of EVENTS) {
				expect(f.process.listenerCount(event)).toBe(0);
				f.process.emit(event, new TypeError("late"));
			}
			expect(f.process.exits).toEqual([]);
		},
	);
});

describe("installProcessHandlers", () => {
	it("stops once for repeated signals, exits successfully and removes every listener", async () => {
		const process = createInMemoryProcess();
		const stop = vi.fn(async () => SIGNAL_REPORT);
		installProcessHandlers({
			process,
			logger: createFakeLogger(),
			handleSignals: true,
			handleCrashes: true,
			stop,
		});
		process.emit("SIGTERM");
		process.emit("SIGINT");
		await vi.waitFor(() => expect(process.exits).toEqual([0]));
		expect(stop).toHaveBeenCalledExactlyOnceWith("signal", "SIGTERM");
		expect(process.exitCode).toBe(0);
		for (const event of EVENTS) {
			expect(process.listenerCount(event)).toBe(0);
		}
	});

	it.each([
		{ failed: [{ step: "teardown", error: "failure" }], abandoned: [] },
		{ failed: [], abandoned: [{ step: "teardown" }] },
	])("exits unsuccessfully when a signal stop is not ok: %j", async (failures) => {
		const process = createInMemoryProcess();
		const stop = vi.fn(async () => ({ ...SIGNAL_REPORT, ...failures, ok: false }));
		installProcessHandlers({
			process,
			logger: createFakeLogger(),
			handleSignals: true,
			handleCrashes: true,
			stop,
		});
		process.emit("SIGTERM");
		await vi.waitFor(() => expect(process.exits).toEqual([1]));
		expect(process.exitCode).toBe(1);
	});

	it.each(["uncaughtException", "unhandledRejection"] as const)(
		"logs %s once with its stack and exits after one crash stop",
		async (event) => {
			const process = createInMemoryProcess();
			const logger = createFakeLogger();
			const error = new TypeError("crash");
			const stop = vi.fn(
				async (): Promise<StopReport> => ({ ok: true, reason: "crash", failed: [], abandoned: [] }),
			);
			installProcessHandlers({ process, logger, handleSignals: true, handleCrashes: true, stop });
			process.emit(event, error);
			process.emit(event, error);
			await vi.waitFor(() => expect(process.exits).toEqual([1]));
			expect(stop).toHaveBeenCalledExactlyOnceWith("crash");
			expect(logger.fatal).toHaveBeenCalledExactlyOnceWith(
				{ err: expect.objectContaining({ stack: error.stack }) },
				expect.any(String),
			);
			for (const registered of EVENTS) {
				expect(process.listenerCount(registered)).toBe(0);
			}
		},
	);

	it("escalates a pending signal stop after a crash without starting or exiting twice", async () => {
		const process = createInMemoryProcess();
		const logger = createFakeLogger();
		const pending = createDeferred<StopReport>();
		const stop = vi.fn(() => pending.promise);
		installProcessHandlers({ process, logger, handleSignals: true, handleCrashes: true, stop });
		process.emit("SIGTERM");
		process.emit("uncaughtException", new TypeError("crash"));
		process.emit("unhandledRejection", new TypeError("again"));
		expect(process.exits).toEqual([]);
		pending.resolve(SIGNAL_REPORT);
		await vi.waitFor(() => expect(process.exits).toEqual([1]));
		expect(stop).toHaveBeenCalledTimes(1);
		expect(logger.fatal).toHaveBeenCalledTimes(1);
	});

	it("supports opting out and an idempotent remover without exiting", () => {
		const process = createInMemoryProcess();
		const stop = vi.fn(async () => SIGNAL_REPORT);
		const remove = installProcessHandlers({
			process,
			logger: createFakeLogger(),
			handleSignals: false,
			handleCrashes: false,
			stop,
		});
		for (const event of EVENTS) {
			expect(process.listenerCount(event)).toBe(0);
			process.emit(event);
		}
		remove();
		remove();
		expect(stop).not.toHaveBeenCalled();
		expect(process.exits).toEqual([]);
	});

	it("removes only its own handlers when the bot stops programmatically", () => {
		const process = createInMemoryProcess();
		const existing = vi.fn();
		process.on("SIGINT", existing);
		const remove = installProcessHandlers({
			process,
			logger: createFakeLogger(),
			handleSignals: true,
			handleCrashes: true,
			stop: vi.fn(async () => SIGNAL_REPORT),
		});
		remove();
		process.emit("SIGINT");
		expect(existing).toHaveBeenCalledOnce();
		expect(process.listenerCount("SIGINT")).toBe(1);
		for (const event of EVENTS.slice(1)) {
			expect(process.listenerCount(event)).toBe(0);
		}
		expect(process.exits).toEqual([]);
	});
});
