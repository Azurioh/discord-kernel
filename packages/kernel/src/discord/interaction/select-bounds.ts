/**
 * What every select menu may declare, whatever it picks from and wherever it
 * is shown (a message or a modal): its hint and how many picks it takes.
 */
export interface SelectBounds {
	placeholder?: string;
	minValues?: number;
	maxValues?: number;
}

/** The setters every discord.js select menu builder carries for {@link SelectBounds}. */
interface SelectBoundsBuilder {
	setPlaceholder(placeholder: string): unknown;
	setMinValues(minValues: number): unknown;
	setMaxValues(maxValues: number): unknown;
}

/** Apply the placeholder and pick-count bounds a select declared, leaving unset ones to Discord. */
export function applySelectBounds<B extends SelectBoundsBuilder>(
	builder: B,
	bounds: SelectBounds,
): B {
	if (bounds.placeholder !== undefined) {
		builder.setPlaceholder(bounds.placeholder);
	}
	if (bounds.minValues !== undefined) {
		builder.setMinValues(bounds.minValues);
	}
	if (bounds.maxValues !== undefined) {
		builder.setMaxValues(bounds.maxValues);
	}
	return builder;
}
