import { errorMessage } from "@/errors/error-message";
import type { Logger } from "@/logger";

/**
 * How long a suggestion search may run (FR-024): past it the search is
 * abandoned, so an autocomplete still answers within Discord's 3 s window.
 */
export const SUGGESTION_TIMEOUT_MS = 2_500;

/** Marks the timer winning the race, whatever the search resolves to. */
const TIMED_OUT: unique symbol = Symbol("timed out");

/**
 * Run a suggestion search within {@link SUGGESTION_TIMEOUT_MS}. A search that
 * runs longer or fails yields `fallback` and a `warn` log naming `at`; it never
 * throws. The timer is cleared as soon as the race settles, so no timer
 * outlives the call. It runs on the global timers, which a test drives with
 * fake timers.
 *
 * @param params.search - the search; may throw or reject.
 * @param params.fallback - what a slow or failed search yields.
 * @param params.logger - where a slow or failed search is reported.
 * @param params.at - what the log names: module, field, guild.
 * @returns the search's result, or `fallback`.
 */
export async function timedSearch<T>(params: {
	search: () => Promise<T>;
	fallback: T;
	logger: Logger;
	at: Readonly<Record<string, unknown>>;
}): Promise<T> {
	const { search, fallback, logger, at } = params;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
		timer = setTimeout(() => resolve(TIMED_OUT), SUGGESTION_TIMEOUT_MS);
	});
	try {
		const result = await Promise.race([(async () => search())(), timeout]);
		if (result === TIMED_OUT) {
			logger.warn(
				{ ...at, timeoutMs: SUGGESTION_TIMEOUT_MS },
				"Settings suggestion search timed out; offering nothing",
			);
			return fallback;
		}
		return result;
	} catch (error) {
		logger.warn(
			{ ...at, err: errorMessage(error) },
			"Settings suggestion search failed; offering nothing",
		);
		return fallback;
	} finally {
		clearTimeout(timer);
	}
}
