import type { LogFn, Logger } from "@/logger";

/** One call made on an {@link InMemoryLogger} or one of its children. */
export interface LogEntry {
	readonly level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
	/** The logger's bindings merged with the record; the record wins on a shared name. */
	readonly fields: Readonly<Record<string, unknown>>;
	readonly message?: string;
}

/** A {@link Logger} that keeps every entry, for a test to read. */
export interface InMemoryLogger extends Logger {
	/** Every entry, in call order, children's included. */
	readonly entries: readonly LogEntry[];
}

function build(entries: LogEntry[], bindings: Readonly<Record<string, unknown>>): InMemoryLogger {
	const at =
		(level: LogEntry["level"]): LogFn =>
		(first: unknown, message?: unknown) => {
			if (typeof first === "object" && first !== null) {
				const fields = { ...bindings, ...(first as Record<string, unknown>) };
				entries.push(typeof message === "string" ? { level, fields, message } : { level, fields });
			} else {
				entries.push({ level, fields: { ...bindings }, message: String(first) });
			}
		};

	return {
		entries,
		trace: at("trace"),
		debug: at("debug"),
		info: at("info"),
		warn: at("warn"),
		error: at("error"),
		fatal: at("fatal"),
		child: (childBindings) => build(entries, { ...bindings, ...childBindings }),
	};
}

/**
 * The in-memory twin of {@link Logger}: plain code, so a bot's tests read what
 * was logged with any runner. A child appends to the same `entries`.
 */
export function createInMemoryLogger(): InMemoryLogger {
	return build([], {});
}
