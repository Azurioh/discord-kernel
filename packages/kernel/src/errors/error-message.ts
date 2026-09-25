/**
 * The message of an unknown thrown value, for a log field that only needs the
 * one line: an `Error`'s own message, anything else as its string form.
 *
 * {@link import("@/errors/describe-error").describeError} is the fuller record
 * — name, stack and nested causes — for failures worth investigating.
 */
export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
