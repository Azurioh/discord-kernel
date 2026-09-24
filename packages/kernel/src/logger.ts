/**
 * A single log call. Mirrors the pino calling convention so call sites can pass
 * either a bare message or a structured record followed by a message:
 * `logger.error({ err }, "Failed to do the thing")`.
 */
export interface LogFn {
	(record: unknown, message?: string, ...args: unknown[]): void;
	(message: string, ...args: unknown[]): void;
}

/**
 * Structured application logger port.
 *
 * Declared structurally on purpose: `core` owns the contract and stays free of
 * any vendor SDK, so the concrete implementation (pino, Sentry, a test double)
 * lives in `infrastructure/logging` and can be swapped without touching call
 * sites.
 */
export interface Logger {
	trace: LogFn;
	debug: LogFn;
	info: LogFn;
	warn: LogFn;
	error: LogFn;
	fatal: LogFn;
	/** Derive a logger that stamps `bindings` onto every record it emits. */
	child(bindings: Record<string, unknown>): Logger;
}
