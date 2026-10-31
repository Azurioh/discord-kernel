import cron from "node-cron";
import type { Logger } from "@/logger";
import {
	AmbiguousJobScheduleError,
	DuplicateJobNameError,
	InvalidJobIntervalError,
	type JobScheduleError,
	MissingJobScheduleError,
} from "@/scheduler/errors";

/**
 * A job as it actually arrives at runtime. The exported `ScheduledJob` union
 * already forbids the invalid combinations, which is exactly why the check below
 * cannot be written against it: the compiler narrows them to `never`. Modules
 * built from untyped config still reach us, so validation reads the unnarrowed
 * shape.
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
function scheduleFailure(job: UnvalidatedJob): JobScheduleError | null {
	const { name, cron: expression, intervalMs } = job;
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
 * Whether a scheduler may register `job`: its name is not taken yet, it has
 * exactly one well-formed schedule, and its cron expression (if any) parses.
 * A refused job is logged at error level, so it is not mistaken for a working
 * one. Shared by every scheduler, so they refuse the same jobs with the same logs.
 *
 * @param registered - the names already registered by this scheduler.
 */
export function isSchedulable(
	job: UnvalidatedJob,
	registered: { has(name: string): boolean },
	logger: Logger,
): boolean {
	const failure = registered.has(job.name)
		? new DuplicateJobNameError(job.name)
		: scheduleFailure(job);
	if (failure !== null) {
		logger.error({ job: job.name, err: failure.message }, "Job schedule invalid, skipped");
		return false;
	}
	if (job.cron !== undefined && !cron.validate(job.cron)) {
		logger.error({ job: job.name, cron: job.cron }, "Invalid cron expression, job skipped");
		return false;
	}
	return true;
}
