import { MissingEnvError } from "@azurioh/discord-kernel/config/errors";

/**
 * Print why a script could not start and mark the process as failed. A
 * missing variable gets one actionable line instead of a stack trace.
 *
 * @param error - whatever the script rejected with.
 */
export function reportStartupFailure(error: unknown): void {
	if (error instanceof MissingEnvError) {
		console.error(`${error.message}. Copy .env.example to .env and fill it in.`);
	} else {
		console.error(error);
	}
	process.exitCode = 1;
}
