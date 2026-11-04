import type { Logger } from "@azurioh/discord-kernel/logger";
import { type DestinationStream, pino } from "pino";

/** Pino adapter with an awaitable shutdown flush. */
export interface PinoLogger extends Logger {
	/** Wait for buffered logs, rejecting destination failures. */
	flush(): Promise<void>;
}

/**
 * The kernel's {@link Logger} port over pino: one JSON line per record on
 * stdout, `err` serialised with its stack. Pretty-printing is left to the dev
 * scripts, which pipe the output through `pino-pretty`.
 *
 * @param name - stamped on every record as `name`.
 * @param destination - where the lines go; stdout when omitted.
 * @returns the logger.
 */
export function createPinoLogger(name: string, destination?: DestinationStream): PinoLogger {
	const logger = pino({ name }, destination);
	return {
		trace: logger.trace.bind(logger),
		debug: logger.debug.bind(logger),
		info: logger.info.bind(logger),
		warn: logger.warn.bind(logger),
		error: logger.error.bind(logger),
		fatal: logger.fatal.bind(logger),
		child: logger.child.bind(logger),
		flush: () =>
			new Promise<void>((resolve, reject) => {
				logger.flush((error) => {
					if (error) {
						reject(error);
					} else {
						resolve();
					}
				});
			}),
	};
}
