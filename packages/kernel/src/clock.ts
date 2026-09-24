/**
 * Abstraction over the current time. Injecting a clock (instead of calling
 * `new Date()` directly) lets domain/application code be tested deterministically
 * and keeps those layers free of ambient I/O.
 */
export interface Clock {
	now(): Date;
}

/** The real clock, backed by the system time. */
export const systemClock: Clock = {
	now: () => new Date(),
};

/** A fixed clock for tests. */
export function fixedClock(instant: Date): Clock {
	return { now: () => new Date(instant) };
}
