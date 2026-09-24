import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/errors/business-error";
import { withRetry } from "@/resilience/retry";

/** Records the requested delays instead of waiting, so the suite never sleeps. */
function createRecordingSleep(): { sleep: (delayMs: number) => Promise<void>; delays: number[] } {
	const delays: number[] = [];
	return {
		delays,
		sleep: async (delayMs) => {
			delays.push(delayMs);
		},
	};
}

/** A task that throws `failures` times before returning `value`. */
function createFlakyTask<T>(failures: number, value: T): () => Promise<T> {
	let calls = 0;
	return async () => {
		calls += 1;
		if (calls <= failures) {
			throw new Error(`attempt ${calls} failed`);
		}
		return value;
	};
}

describe("withRetry", () => {
	it("returns immediately when the task succeeds", async () => {
		const { sleep, delays } = createRecordingSleep();
		const task = vi.fn(async () => "ok");

		await expect(withRetry(task, { sleep })).resolves.toBe("ok");
		expect(task).toHaveBeenCalledTimes(1);
		expect(delays).toEqual([]);
	});

	it("succeeds after transient failures", async () => {
		const { sleep, delays } = createRecordingSleep();

		await expect(withRetry(createFlakyTask(2, "recovered"), { attempts: 3, sleep })).resolves.toBe(
			"recovered",
		);
		expect(delays).toHaveLength(2);
	});

	it("gives up once the attempt budget is spent", async () => {
		const { sleep, delays } = createRecordingSleep();
		const task = vi.fn(async () => {
			throw new Error("always down");
		});

		await expect(withRetry(task, { attempts: 3, sleep })).rejects.toThrow("always down");
		expect(task).toHaveBeenCalledTimes(3);
		// No sleep after the final failure: the budget is already spent.
		expect(delays).toHaveLength(2);
	});

	it("runs the task once when a single attempt is budgeted", async () => {
		const { sleep } = createRecordingSleep();
		const task = vi.fn(async () => {
			throw new Error("down");
		});

		await expect(withRetry(task, { attempts: 1, sleep })).rejects.toThrow("down");
		expect(task).toHaveBeenCalledTimes(1);
	});

	it("does not retry a permanent business failure by default", async () => {
		const { sleep } = createRecordingSleep();
		const task = vi.fn(async () => {
			throw new ValidationError("bad input");
		});

		await expect(withRetry(task, { attempts: 5, sleep })).rejects.toBeInstanceOf(ValidationError);
		expect(task).toHaveBeenCalledTimes(1);
	});

	it("honours a custom shouldRetry predicate", async () => {
		const { sleep } = createRecordingSleep();
		const task = vi.fn(async () => {
			throw new Error("fatal");
		});
		const shouldRetry = vi.fn(() => false);

		await expect(withRetry(task, { attempts: 4, sleep, shouldRetry })).rejects.toThrow("fatal");
		expect(task).toHaveBeenCalledTimes(1);
		expect(shouldRetry).toHaveBeenCalledTimes(1);
	});

	it("retries only while shouldRetry agrees", async () => {
		const { sleep } = createRecordingSleep();
		const task = vi.fn(async () => {
			throw new Error("down");
		});
		const RETRYABLE_ATTEMPTS = 2;
		const shouldRetry = (_error: unknown, attempt: number) => attempt < RETRYABLE_ATTEMPTS;

		await expect(withRetry(task, { attempts: 5, sleep, shouldRetry })).rejects.toThrow("down");
		expect(task).toHaveBeenCalledTimes(RETRYABLE_ATTEMPTS);
	});

	it("grows the delay exponentially, capped by maxDelayMs", async () => {
		const { sleep, delays } = createRecordingSleep();

		await expect(
			withRetry(createFlakyTask(3, "ok"), {
				attempts: 4,
				initialDelayMs: 100,
				maxDelayMs: 300,
				backoffFactor: 2,
				jitterRatio: 1,
				sleep,
			}),
		).resolves.toBe("ok");
		expect(delays).toEqual([100, 200, 300]);
	});

	it("jitters the delay between the fixed share and the full backoff", async () => {
		const { sleep, delays } = createRecordingSleep();

		await expect(
			withRetry(createFlakyTask(1, "ok"), {
				attempts: 2,
				initialDelayMs: 100,
				jitterRatio: 0.5,
				random: () => 1,
				sleep,
			}),
		).resolves.toBe("ok");
		expect(delays).toEqual([100]);
	});

	it("uses the injected sleep rather than real timers", async () => {
		const sleep = vi.fn(async () => undefined);
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

		await expect(withRetry(createFlakyTask(1, "ok"), { attempts: 2, sleep })).resolves.toBe("ok");
		expect(sleep).toHaveBeenCalledTimes(1);
		expect(setTimeoutSpy).not.toHaveBeenCalled();
		setTimeoutSpy.mockRestore();
	});
});

describe("withRetry attempt budget", () => {
	// `Math.max` propagates NaN and `attempt <= NaN` is false immediately, so an
	// unusable budget used to skip the task and reject with `undefined`.
	it("still runs the task once when attempts is not a number", async () => {
		let calls = 0;
		const result = await withRetry(
			async () => {
				calls += 1;
				return "ok";
			},
			{ attempts: Number.NaN, sleep: async () => undefined },
		);

		expect(result).toBe("ok");
		expect(calls).toBe(1);
	});

	it("floors a fractional budget", async () => {
		let calls = 0;
		await expect(
			withRetry(
				async () => {
					calls += 1;
					throw new Error("nope");
				},
				{ attempts: 2.9, sleep: async () => undefined, shouldRetry: () => true },
			),
		).rejects.toThrow("nope");

		expect(calls).toBe(2);
	});
});
