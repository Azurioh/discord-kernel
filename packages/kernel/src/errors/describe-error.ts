/**
 * An error as a log record keeps it: what it says, where it came from, and
 * whatever it is wrapping.
 *
 * `message` alone is not enough for the errors this bot actually hits. A
 * builder that refuses a payload throws `CombinedPropertyError`, whose own
 * message is the constant "Received one or more errors" — everything that
 * names the offending field lives in the errors nested under it. Logging the
 * message and dropping the rest turns a precise complaint into a sentence that
 * says nothing.
 */
export interface DescribedError {
	readonly message: string;
	readonly name?: string;
	readonly stack?: string;
	/**
	 * What this error wraps: the entries of an aggregate, or the `cause` a
	 * rethrow attached.
	 */
	readonly causes?: DescribedError[];
}

/**
 * How deep the wrapping is followed. Aggregates nest two or three levels in
 * practice; the bound is there so a cyclic `cause` cannot spin.
 */
const MAX_DEPTH = 5;

/** How many entries of one aggregate are kept, so a wide failure stays readable. */
const MAX_CAUSES = 10;

/**
 * The errors nested inside one, whatever shape it wraps them in.
 *
 * `AggregateError` and shapeshift's `CombinedError` both expose `errors` as a
 * plain array; shapeshift's `CombinedPropertyError` uses the same field but
 * pairs each error with the property it came from, as `[key, error]`. Taking
 * the last element of an entry reads both, and keeping the key out of the way
 * costs nothing — the nested message names the constraint that failed.
 */
function aggregated(error: object): unknown[] {
	const { errors } = error as { errors?: unknown };
	if (!Array.isArray(errors)) {
		return [];
	}
	return errors
		.slice(0, MAX_CAUSES)
		.map((entry) => (Array.isArray(entry) ? entry[entry.length - 1] : entry));
}

/**
 * Render an unknown thrown value for a structured log.
 *
 * Use it wherever an error is caught to be reported rather than handled:
 * `logger.error({ err: describeError(error) }, "…")`.
 */
export function describeError(error: unknown, depth = 0): DescribedError {
	if (!(error instanceof Error)) {
		return { message: String(error) };
	}
	const causes =
		depth >= MAX_DEPTH
			? []
			: [...aggregated(error), ...(error.cause === undefined ? [] : [error.cause])].map((nested) =>
					describeError(nested, depth + 1),
				);
	return {
		message: error.message,
		name: error.name,
		...(error.stack === undefined ? {} : { stack: error.stack }),
		...(causes.length === 0 ? {} : { causes }),
	};
}
