import { BusinessError } from "@/errors/business-error";

const MIN_ATTEMPTS = 1;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_INITIAL_DELAY_MS = 200;
const DEFAULT_MAX_DELAY_MS = 5_000;
const DEFAULT_BACKOFF_FACTOR = 2;
/** Share of the computed delay kept fixed; the rest is randomised (full jitter on 1 - RATIO). */
const DEFAULT_JITTER_RATIO = 0.5;

export interface RetryOptions {
	/** Total number of tries, first attempt included. */
	attempts?: number;
	initialDelayMs?: number;
	maxDelayMs?: number;
	backoffFactor?: number;
	jitterRatio?: number;
	/** Decide whether a failure is worth another try. Default: anything but a permanent failure. */
	shouldRetry?: (error: unknown, attempt: number) => boolean;
	/** Injected so tests advance instantly instead of waiting on real timers. */
	sleep?: (delayMs: number) => Promise<void>;
	/** Injected randomness keeps the jitter deterministic under test. */
	random?: () => number;
}

/** Everything the backoff needs once caller defaults have been resolved. */
export interface BackoffOptions {
	initialDelayMs: number;
	maxDelayMs: number;
	backoffFactor: number;
	jitterRatio: number;
	random: () => number;
}

/**
 * A {@link BusinessError} describes an expected, user-facing failure (bad input,
 * missing entity, conflict): repeating the call cannot change the outcome, so it
 * is never retried. Everything else is assumed transient until proven otherwise.
 */
function isTransient(error: unknown): boolean {
	return !(error instanceof BusinessError);
}

function defaultSleep(delayMs: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, delayMs);
	});
}

/**
 * Exponential backoff with jitter. The jitter matters more than the curve itself:
 * without it every caller that failed during the same outage retries in lockstep
 * and hammers the dependency back down.
 */
export function computeBackoffDelay(attempt: number, options: BackoffOptions): number {
	const exponential = options.initialDelayMs * options.backoffFactor ** (attempt - 1);
	const capped = Math.min(exponential, options.maxDelayMs);
	const fixed = capped * options.jitterRatio;
	return Math.round(fixed + (capped - fixed) * options.random());
}

/**
 * Run `task`, retrying transient failures until the attempt budget is spent, then
 * rethrowing the last error. Vendor-free by design: callers pass their own
 * `shouldRetry` (e.g. built on the Discord API predicates) so this stays usable
 * for any I/O.
 */
export async function withRetry<T>(task: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
	// `Math.max` propagates NaN, and `attempt <= NaN` is false on the first pass:
	// an unusable budget would skip the task entirely and reject with `undefined`.
	// Floor to a valid count so a bad config still runs the task once.
	const requested = options.attempts ?? DEFAULT_ATTEMPTS;
	const attempts = Number.isFinite(requested)
		? Math.max(MIN_ATTEMPTS, Math.floor(requested))
		: DEFAULT_ATTEMPTS;
	const shouldRetry = options.shouldRetry ?? isTransient;
	const sleep = options.sleep ?? defaultSleep;
	const backoff: BackoffOptions = {
		initialDelayMs: options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS,
		maxDelayMs: options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
		backoffFactor: options.backoffFactor ?? DEFAULT_BACKOFF_FACTOR,
		jitterRatio: options.jitterRatio ?? DEFAULT_JITTER_RATIO,
		random: options.random ?? Math.random,
	};

	let lastError: unknown;
	for (let attempt = MIN_ATTEMPTS; attempt <= attempts; attempt += 1) {
		try {
			return await task();
		} catch (error) {
			lastError = error;
			const isLastAttempt = attempt === attempts;
			if (isLastAttempt || !shouldRetry(error, attempt)) {
				throw error;
			}
			await sleep(computeBackoffDelay(attempt, backoff));
		}
	}
	// Unreachable — the loop always returns or throws — but the compiler cannot
	// prove the budget is non-empty, and a silent `undefined` would be worse.
	throw lastError;
}
