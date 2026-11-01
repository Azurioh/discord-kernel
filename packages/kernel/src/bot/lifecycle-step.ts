import { systemClock } from "@/clock";
import { errorMessage } from "@/errors/error-message";
import type { Logger } from "@/logger";

/** Time and log one lifecycle action; a deadline bounds waiting, not the action itself.
 * @param name - Stable lifecycle step name.
 * @param action - The resource operation to run, including synchronous operations.
 * @param options - Logger, optional target, and absolute deadline in epoch milliseconds.
 * @returns Whether the action completed or was abandoned at the deadline.
 * @throws The original action error, after logging it.
 */
export async function runStep(
	name: string,
	action: () => Promise<unknown> | unknown,
	options: { logger: Logger; deadline?: number; target?: string },
): Promise<{ outcome: "ok" | "abandoned" }> {
	const started = systemClock.now().getTime();
	const fields = {
		step: name,
		...(options.target === undefined ? {} : { target: options.target }),
	};
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const operation = Promise.resolve(action()).then(stepCompleted);
		let result: { outcome: "ok" | "abandoned" };
		if (options.deadline === undefined) {
			result = await operation;
		} else {
			const deadline = options.deadline;
			const timeout =
				deadline <= started
					? Promise.resolve().then(stepAbandoned)
					: new Promise<{ outcome: "abandoned" }>((resolve) => {
							timer = setTimeout(() => resolve({ outcome: "abandoned" }), deadline - started);
						});
			result = await Promise.race([operation, timeout]);
		}
		const record = {
			...fields,
			durationMs: systemClock.now().getTime() - started,
			outcome: result.outcome,
		};
		if (result.outcome === "abandoned") {
			options.logger.error(record, "Lifecycle step abandoned");
		} else {
			options.logger.info(record, "Lifecycle step completed");
		}
		return result;
	} catch (error) {
		options.logger.error(
			{
				...fields,
				durationMs: systemClock.now().getTime() - started,
				outcome: "failed",
				error: errorMessage(error),
			},
			"Lifecycle step failed",
		);
		throw error;
	} finally {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	}
}

function stepCompleted(): { outcome: "ok" } {
	return { outcome: "ok" };
}

function stepAbandoned(): { outcome: "abandoned" } {
	return { outcome: "abandoned" };
}
