import { afterEach, describe, expect, it, vi } from "vitest";
import {
	AmbiguousJobScheduleError,
	DuplicateJobNameError,
	InvalidJobIntervalError,
	MissingJobScheduleError,
	UnknownJobError,
} from "@/scheduler/errors";
import { createInMemoryScheduler } from "@/scheduler/in-memory-scheduler";
import type { ScheduledJob } from "@/scheduler/scheduler";
import { createFakeLogger } from "../support/fake-logger";

const INTERVAL_MS = 1_000;

/** The malformed jobs `CronScheduler` skips, with the error it logs for each. */
const INVALID_JOBS: readonly {
	readonly title: string;
	readonly job: ScheduledJob;
	readonly err: string;
}[] = [
	{
		title: "both a cron expression and an interval",
		job: {
			name: "both",
			cron: "* * * * *",
			intervalMs: INTERVAL_MS,
			run: () => undefined,
		} as unknown as ScheduledJob,
		err: new AmbiguousJobScheduleError("both").message,
	},
	{
		title: "no schedule at all",
		job: { name: "neither", run: () => undefined } as unknown as ScheduledJob,
		err: new MissingJobScheduleError("neither").message,
	},
	{
		title: "a non-positive interval",
		job: { name: "zero", intervalMs: 0, run: () => undefined },
		err: new InvalidJobIntervalError("zero", 0).message,
	},
];

describe("createInMemoryScheduler", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("records the valid jobs and starts", () => {
		const scheduler = createInMemoryScheduler(createFakeLogger());
		const job = { name: "sync", cron: "0 9 * * *", run: vi.fn() };

		scheduler.start([job]);

		expect(scheduler.started).toBe(true);
		expect(scheduler.jobs).toEqual([job]);
	});

	it("can be created without a logger", () => {
		const scheduler = createInMemoryScheduler();

		scheduler.start([{ name: "sync", intervalMs: INTERVAL_MS, run: vi.fn() }]);

		expect(scheduler.jobs).toHaveLength(1);
	});

	for (const { title, job, err } of INVALID_JOBS) {
		it(`skips a job declaring ${title}, logged as CronScheduler does`, () => {
			const logger = createFakeLogger();
			const scheduler = createInMemoryScheduler(logger);

			scheduler.start([job]);

			expect(scheduler.jobs).toEqual([]);
			expect(logger.error).toHaveBeenCalledWith(
				expect.objectContaining({ job: job.name, err }),
				"Job schedule invalid, skipped",
			);
		});
	}

	it("skips a duplicate job name, logged as CronScheduler does", () => {
		const logger = createFakeLogger();
		const scheduler = createInMemoryScheduler(logger);
		const first = { name: "same", intervalMs: INTERVAL_MS, run: vi.fn() };

		scheduler.start([first, { name: "same", intervalMs: INTERVAL_MS, run: vi.fn() }]);

		expect(scheduler.jobs).toEqual([first]);
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ job: "same", err: new DuplicateJobNameError("same").message }),
			"Job schedule invalid, skipped",
		);
	});

	it("skips a job whose cron expression is invalid, logged as CronScheduler does", () => {
		const logger = createFakeLogger();
		const scheduler = createInMemoryScheduler(logger);
		const run = vi.fn();

		scheduler.start([{ name: "broken", cron: "not a cron", runOnStart: true, run }]);

		expect(scheduler.jobs).toEqual([]);
		expect(run).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ job: "broken" }),
			"Invalid cron expression, job skipped",
		);
	});

	it("runs a job now on run(name)", async () => {
		const scheduler = createInMemoryScheduler(createFakeLogger());
		const run = vi.fn();
		scheduler.start([{ name: "sync", cron: "0 9 * * *", run }]);

		await scheduler.run("sync");

		expect(run).toHaveBeenCalledTimes(1);
	});

	it("isolates the error of a job run on demand", async () => {
		const logger = createFakeLogger();
		const scheduler = createInMemoryScheduler(logger);
		scheduler.start([
			{ name: "sync", intervalMs: INTERVAL_MS, run: vi.fn().mockRejectedValue(new Error("boom")) },
		]);

		await expect(scheduler.run("sync")).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ job: "sync", err: "boom" }),
			"Scheduled job failed",
		);
	});

	it("rejects run() for an unknown job name", async () => {
		const scheduler = createInMemoryScheduler(createFakeLogger());
		scheduler.start([]);

		await expect(scheduler.run("missing")).rejects.toBeInstanceOf(UnknownJobError);
	});

	it("runs a runOnStart job once at start", () => {
		const scheduler = createInMemoryScheduler(createFakeLogger());
		const boot = vi.fn();
		const quiet = vi.fn();

		scheduler.start([
			{ name: "boot", intervalMs: INTERVAL_MS, runOnStart: true, run: boot },
			{ name: "quiet", intervalMs: INTERVAL_MS, run: quiet },
		]);

		expect(boot).toHaveBeenCalledTimes(1);
		expect(quiet).not.toHaveBeenCalled();
	});

	it("validates cron expressions", () => {
		const scheduler = createInMemoryScheduler(createFakeLogger());

		expect(scheduler.isValidCron("0 9 * * *")).toBe(true);
		expect(scheduler.isValidCron("not a cron")).toBe(false);
	});

	it("updates the cron of a registered job on rescheduleCron", () => {
		const scheduler = createInMemoryScheduler(createFakeLogger());
		scheduler.start([{ name: "editable", cron: "0 9 * * 6", run: vi.fn() }]);

		expect(scheduler.rescheduleCron("editable", "0 10 * * 6")).toBe(true);
		expect(scheduler.jobs[0]?.cron).toBe("0 10 * * 6");
	});

	it("refuses to reschedule an unknown job, an interval job or an invalid cron", () => {
		const scheduler = createInMemoryScheduler(createFakeLogger());
		scheduler.start([
			{ name: "editable", cron: "0 9 * * 6", run: vi.fn() },
			{ name: "interval", intervalMs: INTERVAL_MS, run: vi.fn() },
		]);

		expect(scheduler.rescheduleCron("missing", "0 10 * * 6")).toBe(false);
		expect(scheduler.rescheduleCron("interval", "0 10 * * 6")).toBe(false);
		expect(scheduler.rescheduleCron("editable", "not a cron")).toBe(false);
		expect(scheduler.jobs[0]?.cron).toBe("0 9 * * 6");
	});

	it("clears the jobs and started on stop", () => {
		const scheduler = createInMemoryScheduler(createFakeLogger());
		scheduler.start([{ name: "sync", intervalMs: INTERVAL_MS, run: vi.fn() }]);

		scheduler.stop();

		expect(scheduler.jobs).toEqual([]);
		expect(scheduler.started).toBe(false);
	});

	it("never runs a job by timer", async () => {
		vi.useFakeTimers();
		const scheduler = createInMemoryScheduler(createFakeLogger());
		const cronRun = vi.fn();
		const intervalRun = vi.fn();
		scheduler.start([
			{ name: "cron", cron: "* * * * * *", run: cronRun },
			{ name: "interval", intervalMs: INTERVAL_MS, run: intervalRun },
		]);

		await vi.advanceTimersByTimeAsync(INTERVAL_MS * 120);

		expect(cronRun).not.toHaveBeenCalled();
		expect(intervalRun).not.toHaveBeenCalled();
	});
});
