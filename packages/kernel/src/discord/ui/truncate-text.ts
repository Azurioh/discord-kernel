/**
 * `text` cut to at most `max` characters, its last one an ellipsis when it
 * had to be cut: Discord rejects a whole message over one text that is too
 * long, so a value of unknown length is shortened rather than sent as is.
 *
 * @param text - the text to fit.
 * @param max - the most characters the result may hold.
 * @returns `text` itself when it fits, its shortened form otherwise.
 */
export function truncateText(text: string, max: number): string {
	if (text.length <= max) {
		return text;
	}
	return `${text.slice(0, max - 1)}…`;
}
