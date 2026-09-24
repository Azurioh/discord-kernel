/**
 * Units in their only accepted order, largest first, each with its length in
 * seconds. Fixing the order makes every duration have one spelling.
 */
const DURATION_PATTERN = /^(?:(\d+)d)?\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/;
const UNIT_SECONDS = [86_400, 3600, 60, 1] as const;

/**
 * Parse a human duration such as `"90s"`, `"15m"`, `"2h"`, `"7d"` or `"1h30m"`
 * into whole seconds. Units go from days to seconds, each at most once; case
 * and whitespace between parts are ignored. Returns `undefined` for anything
 * else, including a bare number and a total beyond the safe integer range.
 */
export function parseDuration(input: string): number | undefined {
	const trimmed = input.trim().toLowerCase();
	if (trimmed === "") {
		return undefined;
	}
	const match = DURATION_PATTERN.exec(trimmed);
	if (match === null) {
		return undefined;
	}
	let seconds = 0;
	for (const [index, unit] of UNIT_SECONDS.entries()) {
		const amount = match[index + 1];
		if (amount !== undefined) {
			seconds += Number(amount) * unit;
		}
	}
	return Number.isSafeInteger(seconds) ? seconds : undefined;
}
