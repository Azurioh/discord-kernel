/**
 * Turn what an administrator typed into a settings value: JSON when it parses
 * (`42`, `true`, `["1","2"]`, `{"logs":true}`), the raw text otherwise. A number
 * JSON cannot hold exactly — a snowflake typed without quotes — stays text, so
 * an id never loses its last digits.
 *
 * @param input - the raw option text.
 * @returns the value to submit to the settings service.
 */
export function parseValueInput(input: string): unknown {
	let parsed: unknown;
	try {
		parsed = JSON.parse(input);
	} catch {
		return input;
	}
	if (typeof parsed === "number" && Number.isInteger(parsed) && !Number.isSafeInteger(parsed)) {
		return input;
	}
	return parsed;
}
