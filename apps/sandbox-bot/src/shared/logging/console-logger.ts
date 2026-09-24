import type { LogFn, Logger } from "@azurioh/discord-kernel/logger";

type Level = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const CONSOLE_METHOD: Readonly<Record<Level, "debug" | "info" | "warn" | "error">> = {
	trace: "debug",
	debug: "debug",
	info: "info",
	warn: "warn",
	error: "error",
	fatal: "error",
};

/** Accepts both call shapes of {@link LogFn}: `(message, ...args)` and `(record, message, ...args)`. */
function createLogFn(level: Level, bindings: Readonly<Record<string, unknown>>): LogFn {
	return (first: unknown, ...rest: unknown[]) => {
		const [record, message, args] =
			typeof first === "string" ? [{}, first, rest] : [first, rest[0], rest.slice(1)];
		const context = { ...bindings, ...(typeof record === "object" ? record : { record }) };
		const suffix = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
		console[CONSOLE_METHOD[level]](`[${level}] ${String(message ?? "")}${suffix}`, ...args);
	};
}

/**
 * A {@link Logger} over the console, enough for a sandbox: one line per call,
 * the level, the message, then the bindings and the record as JSON.
 *
 * @param bindings - stamped on every line, as a child logger's are.
 * @returns the logger.
 */
export function createConsoleLogger(bindings: Readonly<Record<string, unknown>> = {}): Logger {
	return {
		trace: createLogFn("trace", bindings),
		debug: createLogFn("debug", bindings),
		info: createLogFn("info", bindings),
		warn: createLogFn("warn", bindings),
		error: createLogFn("error", bindings),
		fatal: createLogFn("fatal", bindings),
		child: (extra) => createConsoleLogger({ ...bindings, ...extra }),
	};
}
