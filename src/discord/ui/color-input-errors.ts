/**
 * A bot registered a colour name longer than the field an administrator types
 * it into. Raised while the composition root registers its aliases at boot —
 * the alternative is a name Discord silently truncates, which then never
 * resolves and looks like the parser rejecting a colour it actually knows.
 */
export class ColorAliasTooLongError extends Error {
	constructor(
		readonly alias: string,
		readonly maxLength: number,
	) {
		super(
			`Colour alias "${alias}" is ${alias.length} characters, over the ${maxLength} the input field accepts`,
		);
		this.name = "ColorAliasTooLongError";
	}
}
