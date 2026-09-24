import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "@/logger";
import {
	AmbiguousJobScheduleError,
	DuplicateJobNameError,
	InvalidJobIntervalError,
	MissingJobScheduleError,
} from "@/scheduler/errors";
import { CronScheduler, type ScheduledJob } from "@/scheduler/scheduler";

function createLoggerSpy(): Logger {
	const logger = {
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
		child: () => logger,
	};
	return logger as unknown as Logger;
}

const INTERVAL_MS = 1_000;

describe("CronScheduler schedule validation", () => {
	// A malformed schedule disables that job alone. `start()` runs inside the
	// `ready` handler, on an already-online bot: throwing would leave every other
	// module's jobs unregistered while the bot still looks healthy.
	it("skips a job declaring both a cron expression and an interval", () => {
		const logger = createLoggerSpy();
		const scheduler = new CronScheduler(logger);
		const job = {
			name: "both",
			cron: "* * * * *",
			intervalMs: INTERVAL_MS,
			run: vi.fn(),
		} as unknown as ScheduledJob;

		expect(() => scheduler.start([job])).not.toThrow();
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				job: "both",
				err: new AmbiguousJobScheduleError("both").message,
			}),
			"Job schedule invalid, skipped",
		);
	});

	it("skips a job declaring no schedule at all", () => {
		const logger = createLoggerSpy();
		const scheduler = new CronScheduler(logger);
		const job = { name: "neither", run: vi.fn() } as unknown as ScheduledJob;

		scheduler.start([job]);

		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				job: "neither",
				err: new MissingJobScheduleError("neither").message,
			}),
			"Job schedule invalid, skipped",
		);
	});

	it("skips a non-positive interval", () => {
		const logger = createLoggerSpy();
		const scheduler = new CronScheduler(logger);

		scheduler.start([{ name: "zero", intervalMs: 0, run: vi.fn() }]);

		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				job: "zero",
				err: new InvalidJobIntervalError("zero", 0).message,
			}),
			"Job schedule invalid, skipped",
		);
	});

	it("still registers the healthy jobs of a batch containing a bad one", () => {
		const scheduler = new CronScheduler(createLoggerSpy());
		const valid = { name: "valid", intervalMs: INTERVAL_MS, runOnStart: true, run: vi.fn() };
		const invalid = { name: "invalid", run: vi.fn() } as unknown as ScheduledJob;

		scheduler.start([valid, invalid]);

		expect(valid.run).toHaveBeenCalledTimes(1);
		expect(invalid.run).not.toHaveBeenCalled();
		scheduler.stop();
	});

	it("skips a duplicate stable job name", () => {
		const logger = createLoggerSpy();
		const scheduler = new CronScheduler(logger);
		const firstRun = vi.fn();
		const duplicateRun = vi.fn();

		scheduler.start([
			{ name: "same", intervalMs: INTERVAL_MS, runOnStart: true, run: firstRun },
			{ name: "same", intervalMs: INTERVAL_MS, runOnStart: true, run: duplicateRun },
		]);

		expect(firstRun).toHaveBeenCalledTimes(1);
		expect(duplicateRun).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				job: "same",
				err: new DuplicateJobNameError("same").message,
			}),
			"Job schedule invalid, skipped",
		);
		scheduler.stop();
	});
});

describe("CronScheduler cron rescheduling", () => {
	it("exposes whether initial registration has started", () => {
		const scheduler = new CronScheduler(createLoggerSpy());
		expect(scheduler.started).toBe(false);

		scheduler.start([]);
		expect(scheduler.started).toBe(true);

		scheduler.stop();
		expect(scheduler.started).toBe(false);
	});

	it("replaces a registered cron job at runtime", () => {
		const logger = createLoggerSpy();
		const scheduler = new CronScheduler(logger);
		scheduler.start([{ name: "editable", cron: "0 9 * * 6", run: vi.fn() }]);

		expect(scheduler.rescheduleCron("editable", "0 10 * * 6")).toBe(true);
		expect(logger.info).toHaveBeenCalledWith(
			{ job: "editable", cron: "0 10 * * 6" },
			"Scheduled cron job updated",
		);
		scheduler.stop();
	});

	it("keeps the current task when the replacement cron is invalid", () => {
		const scheduler = new CronScheduler(createLoggerSpy());
		scheduler.start([{ name: "editable", cron: "0 9 * * 6", run: vi.fn() }]);

		expect(scheduler.rescheduleCron("editable", "not a cron")).toBe(false);
		expect(scheduler.rescheduleCron("editable", "0 10 * * 6")).toBe(true);
		scheduler.stop();
	});

	it("rejects missing and interval jobs", () => {
		const scheduler = new CronScheduler(createLoggerSpy());
		scheduler.start([{ name: "interval", intervalMs: INTERVAL_MS, run: vi.fn() }]);

		expect(scheduler.rescheduleCron("missing", "0 10 * * 6")).toBe(false);
		expect(scheduler.rescheduleCron("interval", "0 10 * * 6")).toBe(false);
		scheduler.stop();
	});
});

describe("CronScheduler interval jobs", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// The next run is armed only once the previous one settles, so the test has to
	// yield to the microtask queue between ticks — that is the very property that
	// prevents a slow job from overlapping itself.
	it("runs an interval job once per elapsed interval", async () => {
		const scheduler = new CronScheduler(createLoggerSpy());
		const run = vi.fn();
		scheduler.start([{ name: "interval", intervalMs: INTERVAL_MS, run }]);

		expect(run).not.toHaveBeenCalled();
		for (let tick = 0; tick < 3; tick += 1) {
			await vi.advanceTimersByTimeAsync(INTERVAL_MS);
		}
		expect(run).toHaveBeenCalledTimes(3);
		scheduler.stop();
	});

	it("never overlaps a run slower than its own interval", async () => {
		const scheduler = new CronScheduler(createLoggerSpy());
		let inFlight = 0;
		let maxConcurrent = 0;
		const run = vi.fn(async () => {
			inFlight += 1;
			maxConcurrent = Math.max(maxConcurrent, inFlight);
			await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS * 3));
			inFlight -= 1;
		});
		scheduler.start([{ name: "slow", intervalMs: INTERVAL_MS, run }]);

		await vi.advanceTimersByTimeAsync(INTERVAL_MS * 10);

		expect(maxConcurrent).toBe(1);
		scheduler.stop();
	});

	it("stops firing once stop() cleared the timer", () => {
		const scheduler = new CronScheduler(createLoggerSpy());
		const run = vi.fn();
		scheduler.start([{ name: "interval", intervalMs: INTERVAL_MS, run }]);

		vi.advanceTimersByTime(INTERVAL_MS);
		scheduler.stop();
		vi.advanceTimersByTime(INTERVAL_MS * 5);

		expect(run).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("logs a failing run and keeps the schedule alive", async () => {
		const logger = createLoggerSpy();
		const scheduler = new CronScheduler(logger);
		const run = vi.fn().mockRejectedValue(new Error("boom"));
		scheduler.start([{ name: "flaky", intervalMs: INTERVAL_MS, run }]);

		await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2);

		expect(run).toHaveBeenCalledTimes(2);
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ job: "flaky", err: "boom" }),
			"Scheduled job failed",
		);
	});
});

describe("CronScheduler runOnStart", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("runs the job once at start, before any interval elapsed", () => {
		const scheduler = new CronScheduler(createLoggerSpy());
		const run = vi.fn();
		scheduler.start([{ name: "boot", intervalMs: INTERVAL_MS, runOnStart: true, run }]);

		expect(run).toHaveBeenCalledTimes(1);
		scheduler.stop();
	});

	it("leaves a job without runOnStart untouched at start", () => {
		const scheduler = new CronScheduler(createLoggerSpy());
		const run = vi.fn();
		scheduler.start([{ name: "quiet", intervalMs: INTERVAL_MS, run }]);

		expect(run).not.toHaveBeenCalled();
		scheduler.stop();
	});

	it("also runs a cron job at start", () => {
		const scheduler = new CronScheduler(createLoggerSpy());
		const run = vi.fn();
		scheduler.start([{ name: "cron-boot", cron: "* * * * *", runOnStart: true, run }]);

		expect(run).toHaveBeenCalledTimes(1);
		scheduler.stop();
	});

	it("skips the boot run of a job whose cron expression was rejected", () => {
		const logger = createLoggerSpy();
		const scheduler = new CronScheduler(logger);
		const run = vi.fn();
		scheduler.start([{ name: "broken", cron: "not a cron", runOnStart: true, run }]);

		expect(run).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ job: "broken" }),
			"Invalid cron expression, job skipped",
		);
	});

	it("isolates a failing boot run instead of throwing at start", async () => {
		const logger = createLoggerSpy();
		const scheduler = new CronScheduler(logger);
		const run = vi.fn().mockRejectedValue(new Error("boot failed"));

		expect(() =>
			scheduler.start([{ name: "boot", intervalMs: INTERVAL_MS, runOnStart: true, run }]),
		).not.toThrow();
		await vi.runOnlyPendingTimersAsync();
		scheduler.stop();

		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ job: "boot", err: "boot failed" }),
			"Scheduled job failed",
		);
	});
});
