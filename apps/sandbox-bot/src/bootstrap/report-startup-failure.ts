import { MissingEnvError } from "@azurioh/discord-kernel/config/errors";
import type { Logger } from "@azurioh/discord-kernel/logger";

/**
 * Log why a script could not start and mark the process as failed. A missing
 * variable gets one actionable line instead of a stack trace.
 *
 * @param logger - built before the configuration, so it can report its failure.
 * @param error - whatever the script rejected with.
 */
export function reportStartupFailure(logger: Logger, error: unknown): void {
	if (error instanceof MissingEnvError) {
		logger.fatal(`${error.message}. Copy .env.example to .env and fill it in.`);
	} else {
		logger.fatal({ err: error }, "The sandbox could not start");
	}
	process.exitCode = 1;
}
