import type { Logger } from "@azurioh/discord-kernel/logger";
import { type DestinationStream, pino } from "pino";

/**
 * The kernel's {@link Logger} port over pino: one JSON line per record on
 * stdout, `err` serialised with its stack. Pretty-printing is left to the dev
 * scripts, which pipe the output through `pino-pretty`.
 *
 * @param name - stamped on every record as `name`.
 * @param destination - where the lines go; stdout when omitted.
 * @returns the logger.
 */
export function createPinoLogger(name: string, destination?: DestinationStream): Logger {
	return pino({ name }, destination);
}
