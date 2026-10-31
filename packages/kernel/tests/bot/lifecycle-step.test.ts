import { afterEach, describe, expect, it, vi } from "vitest";
import { runStep } from "@/bot/lifecycle-step";
import { createDeferred } from "../support/deferred";
import { createFakeLogger } from "../support/fake-logger";

afterEach(() => vi.useRealTimers());

describe("runStep", () => {
	it("logs a successful step and its duration", async () => {
		vi.useFakeTimers();
		const logger = createFakeLogger();
		const result = await runStep("gateway.login", () => undefined, { logger });
		expect(result).toEqual({ outcome: "ok" });
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ step: "gateway.login", durationMs: 0, outcome: "ok" }),
			expect.any(String),
		);
		expect(vi.getTimerCount()).toBe(0);
	});
	it("logs target and original error, then rethrows", async () => {
		const logger = createFakeLogger();
		const error = new TypeError("setup failed");
		await expect(
			runStep(
				"module.setup",
				() => {
					throw error;
				},
				{ logger, target: "demo" },
			),
		).rejects.toBe(error);
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				step: "module.setup",
				target: "demo",
				outcome: "failed",
				error: "setup failed",
			}),
			expect.any(String),
		);
	});
	it("abandons a hanging action at its deadline and clears the timer", async () => {
		vi.useFakeTimers();
		const logger = createFakeLogger();
		const pending = runStep("module.teardown", () => new Promise<void>(() => {}), {
			logger,
			deadline: Date.now() + 100,
			target: "demo",
		});
		await vi.advanceTimersByTimeAsync(100);
		expect(await pending).toEqual({ outcome: "abandoned" });
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ step: "module.teardown", target: "demo", outcome: "abandoned" }),
			expect.any(String),
		);
		expect(vi.getTimerCount()).toBe(0);
	});
	it("observes a rejection after abandonment without an unhandled rejection", async () => {
		vi.useFakeTimers();
		const action = createDeferred<void>();
		const pending = runStep("flush", () => action.promise, {
			logger: createFakeLogger(),
			deadline: Date.now() + 10,
		});
		await vi.advanceTimersByTimeAsync(10);
		expect(await pending).toEqual({ outcome: "abandoned" });
		action.reject(new TypeError("late failure"));
		await Promise.resolve();
	});
});
