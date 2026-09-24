/**
 * Failures raised while a job's schedule is resolved. They live apart from the
 * scheduler so a composition root can catch or re-map them without importing the
 * scheduling logic, and so the scheduler file stays focused on behaviour.
 */

/** Base class for every malformed-schedule failure, so callers can catch the family. */
export abstract class JobScheduleError extends Error {}

/** Raised when a job declares both a cron expression and a fixed interval. */
export class AmbiguousJobScheduleError extends JobScheduleError {
	constructor(jobName: string) {
		super(`Job ${jobName} declares both "cron" and "intervalMs": pick exactly one`);
		this.name = "AmbiguousJobScheduleError";
	}
}

/** Raised when a job declares neither a cron expression nor a fixed interval. */
export class MissingJobScheduleError extends JobScheduleError {
	constructor(jobName: string) {
		super(`Job ${jobName} declares no schedule: it needs either "cron" or "intervalMs"`);
		this.name = "MissingJobScheduleError";
	}
}

/** Raised when a fixed interval is not a usable delay (non-finite or non-positive). */
export class InvalidJobIntervalError extends JobScheduleError {
	constructor(jobName: string, intervalMs: number) {
		super(`Job ${jobName} declares an invalid "intervalMs" (${intervalMs}): expected > 0`);
		this.name = "InvalidJobIntervalError";
	}
}

/** Raised when two jobs declare the same stable identifier. */
export class DuplicateJobNameError extends JobScheduleError {
	constructor(jobName: string) {
		super(`Job ${jobName} is declared more than once: scheduled job names must be unique`);
		this.name = "DuplicateJobNameError";
	}
}
