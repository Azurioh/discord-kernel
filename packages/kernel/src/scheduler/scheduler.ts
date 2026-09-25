import cron from "node-cron";
import { errorMessage } from "@/errors/error-message";
import type { Logger } from "@/logger";
import {
	AmbiguousJobScheduleError,
	DuplicateJobNameError,
	InvalidJobIntervalError,
	type JobScheduleError,
	MissingJobScheduleError,
} from "@/scheduler/errors";

/** What every job carries, whatever schedule drives it. */
interface BaseScheduledJob {
	/** Stable identifier, used in logs. */
	readonly name: string;
	/**
	 * Also run once when the scheduler starts, on top of the recurring schedule —
	 * the usual need for state reconciliation after a restart.
	 */
	readonly runOnStart?: boolean;
	run(): Promise<void> | void;
}

/** A job driven by a cron expression. */
export interface CronScheduledJob extends BaseScheduledJob {
	/** Standard cron expression (5 or 6 fields). */
	readonly cron: string;
	readonly intervalMs?: never;
}

/** A job driven by a plain fixed delay between two runs. */
export interface IntervalScheduledJob extends BaseScheduledJob {
	/** Delay between two runs, in milliseconds. */
	readonly intervalMs: number;
	readonly cron?: never;
}

/**
 * A recurring job declared by a module. Kept free of any scheduling-library
 * type so modules depend only on this contract, not on node-cron. The union
 * makes `cron` and `intervalMs` mutually exclusive at compile time; the
 * scheduler re-checks at runtime because a job may be built from untyped config.
 */
export type ScheduledJob = CronScheduledJob | IntervalScheduledJob;

export interface SchedulerOptions {
	/** IANA timezone the cron expressions are evaluated against. */
	timezone?: string;
}

/** Undo a registration; the shape `stop()` collects, whatever timer backs the job. */
type StopTask = () => void;

interface RegisteredTask {
	readonly job: ScheduledJob;
	readonly stop: StopTask;
}

/** Scheduler control exposed to modules through dependency injection. */
export interface Scheduler {
	readonly started: boolean;
	start(jobs: Iterable<ScheduledJob>): void;
	isValidCron(expression: string): boolean;
	rescheduleCron(jobName: string, expression: string): boolean;
	stop(): void;
}

/**
 * A job as it actually arrives at runtime. The exported union already forbids
 * the invalid combinations, which is exactly why the check below cannot be
 * written against it: the compiler narrows them to `never`. Modules built from
 * untyped config still reach us, so validation reads the unnarrowed shape.
 */
interface UnvalidatedJob {
	readonly name: string;
	readonly cron?: string;
	readonly intervalMs?: number;
}

/**
 * The schedule failure of a single job, or `null` when it is well-formed.
 * Returned rather than thrown: `start()` runs inside the `ready` handler, on an
 * already-online bot, so one malformed job must not cancel every other module's
 * jobs. The caller logs it and skips that job alone.
 */
function scheduleFailure(job: ScheduledJob): JobScheduleError | null {
	const { name, cron: expression, intervalMs } = job as UnvalidatedJob;
	const hasCron = expression !== undefined;
	const hasInterval = intervalMs !== undefined;
	if (hasCron && hasInterval) {
		return new AmbiguousJobScheduleError(name);
	}
	if (!hasCron && !hasInterval) {
		return new MissingJobScheduleError(name);
	}
	if (intervalMs !== undefined && (!Number.isFinite(intervalMs) || intervalMs <= 0)) {
		return new InvalidJobIntervalError(name, intervalMs);
	}
	return null;
}

/**
 * Schedules {@link ScheduledJob}s via node-cron, wrapping each run so a thrown
 * error is logged rather than crashing the process. The concrete library is an
 * implementation detail confined to this file.
 */
export class CronScheduler implements Scheduler {
	private readonly tasks = new Map<string, RegisteredTask>();
	private running = false;

	constructor(
		private readonly logger: Logger,
		private readonly options: SchedulerOptions = {},
	) {}

	get started(): boolean {
		return this.running;
	}

	start(jobs: Iterable<ScheduledJob>): void {
		this.running = true;
		const declared = [...jobs];
		for (const job of declared) {
			if (this.tasks.has(job.name)) {
				const failure = new DuplicateJobNameError(job.name);
				this.logger.error({ job: job.name, err: failure.message }, "Job schedule invalid, skipped");
				continue;
			}
			// A malformed schedule disables that job only. Skipping is logged at
			// error level so it is not mistaken for a working job.
			const failure = scheduleFailure(job);
			if (failure !== null) {
				this.logger.error({ job: job.name, err: failure.message }, "Job schedule invalid, skipped");
				continue;
			}
			const stopTask = job.cron !== undefined ? this.scheduleCron(job) : this.scheduleInterval(job);
			// An unusable schedule already disabled the job, so a boot run would
			// fire something the caller has been told is not running.
			if (stopTask !== null) {
				this.tasks.set(job.name, { job, stop: stopTask });
			}
			if (stopTask !== null && job.runOnStart === true) {
				void this.runIsolated(job);
			}
		}
	}

	isValidCron(expression: string): boolean {
		return cron.validate(expression);
	}

	/** Replace one running cron task without restarting the scheduler or the bot. */
	rescheduleCron(jobName: string, expression: string): boolean {
		const current = this.tasks.get(jobName);
		if (current === undefined || current.job.cron === undefined) {
			this.logger.error({ job: jobName }, "Cron job not found, reschedule skipped");
			return false;
		}
		if (!this.isValidCron(expression)) {
			this.logger.error(
				{ job: jobName, cron: expression },
				"Invalid cron expression, reschedule skipped",
			);
			return false;
		}

		const replacement: CronScheduledJob = { ...current.job, cron: expression };
		const replacementStop = this.scheduleCron(replacement, false);
		if (replacementStop === null) {
			return false;
		}
		current.stop();
		this.tasks.set(jobName, { job: replacement, stop: replacementStop });
		this.logger.info({ job: jobName, cron: expression }, "Scheduled cron job updated");
		return true;
	}

	private scheduleCron(job: CronScheduledJob, logRegistration = true): StopTask | null {
		if (!this.isValidCron(job.cron)) {
			this.logger.error({ job: job.name, cron: job.cron }, "Invalid cron expression, job skipped");
			return null;
		}
		const task = cron.schedule(
			job.cron,
			() => this.runIsolated(job),
			this.options.timezone ? { timezone: this.options.timezone } : undefined,
		);
		const stop = (): void => {
			task.stop();
		};
		if (logRegistration) {
			this.logger.info({ job: job.name, cron: job.cron }, "Scheduled job registered");
		}
		return stop;
	}

	private scheduleInterval(job: IntervalScheduledJob): StopTask {
		// Rescheduled after each run rather than `setInterval`: a run slower than
		// its own interval would otherwise overlap itself, and a reconciliation job
		// racing a previous pass is exactly the interleaving the KeyedQueue exists
		// to prevent. The contract is "at most one run at a time".
		let timer: ReturnType<typeof setTimeout> | null = null;
		let stopped = false;

		const scheduleNext = (): void => {
			if (stopped) {
				return;
			}
			timer = setTimeout(() => {
				void this.runIsolated(job).finally(scheduleNext);
			}, job.intervalMs);
			// Nothing here should hold the event loop open by itself; `stop()` clears
			// the timer on shutdown, and unref keeps a forgotten job from doing so.
			timer.unref?.();
		};

		scheduleNext();
		const stop = (): void => {
			stopped = true;
			if (timer !== null) {
				clearTimeout(timer);
			}
		};
		this.logger.info({ job: job.name, intervalMs: job.intervalMs }, "Scheduled job registered");
		return stop;
	}

	/** Run a job so a thrown error is logged instead of reaching the process. */
	private async runIsolated(job: ScheduledJob): Promise<void> {
		try {
			await job.run();
		} catch (error) {
			this.logger.error({ job: job.name, err: errorMessage(error) }, "Scheduled job failed");
		}
	}

	/** Stop every scheduled task (used on graceful shutdown). */
	stop(): void {
		for (const task of this.tasks.values()) {
			task.stop();
		}
		this.tasks.clear();
		this.running = false;
	}
}
