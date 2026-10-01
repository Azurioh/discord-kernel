import cron from "node-cron";
import { errorMessage } from "@/errors/error-message";
import { createInMemoryLogger } from "@/in-memory-logger";
import type { Logger } from "@/logger";
import { UnknownJobError } from "@/scheduler/errors";
import type { ScheduledJob, Scheduler } from "@/scheduler/scheduler";
import { isSchedulable } from "@/scheduler/validate-jobs";

/** A {@link Scheduler} that runs a job only when a test asks it to. */
export interface InMemoryScheduler extends Scheduler {
	/** The registered jobs, in registration order. */
	readonly jobs: readonly ScheduledJob[];
	/**
	 * Run the job now; its error is logged, as a scheduled run's would be.
	 *
	 * @throws {UnknownJobError} when no registered job has that name.
	 */
	run(jobName: string): Promise<void>;
}

/**
 * The in-memory twin of {@link Scheduler}: it refuses the same jobs with the
 * same logs as `CronScheduler`, runs `runOnStart` jobs at `start`, and never
 * runs anything by timer.
 *
 * @param logger - where refused jobs and failed runs are logged; an in-memory
 *   logger by default.
 */
export function createInMemoryScheduler(
	logger: Logger = createInMemoryLogger(),
): InMemoryScheduler {
	const jobs = new Map<string, ScheduledJob>();
	let started = false;

	const runIsolated = async (job: ScheduledJob): Promise<void> => {
		try {
			await job.run();
		} catch (error) {
			logger.error({ job: job.name, err: errorMessage(error) }, "Scheduled job failed");
		}
	};

	return {
		get started() {
			return started;
		},
		get jobs() {
			return [...jobs.values()];
		},
		start(declared) {
			started = true;
			for (const job of declared) {
				if (!isSchedulable(job, jobs, logger)) {
					continue;
				}
				jobs.set(job.name, job);
				if (job.runOnStart === true) {
					void runIsolated(job);
				}
			}
		},
		isValidCron(expression) {
			return cron.validate(expression);
		},
		rescheduleCron(jobName, expression) {
			const current = jobs.get(jobName);
			if (current === undefined || current.cron === undefined) {
				logger.error({ job: jobName }, "Cron job not found, reschedule skipped");
				return false;
			}
			if (!cron.validate(expression)) {
				logger.error(
					{ job: jobName, cron: expression },
					"Invalid cron expression, reschedule skipped",
				);
				return false;
			}
			jobs.set(jobName, { ...current, cron: expression });
			logger.info({ job: jobName, cron: expression }, "Scheduled cron job updated");
			return true;
		},
		async run(jobName) {
			const job = jobs.get(jobName);
			if (job === undefined) {
				throw new UnknownJobError(jobName);
			}
			await runIsolated(job);
		},
		stop() {
			jobs.clear();
			started = false;
		},
	};
}
