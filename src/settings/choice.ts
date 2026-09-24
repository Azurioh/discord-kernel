/**
 * A single suggestion offered to a user while they pick a value: the label shown
 * and the value stored. Vendor-free so the settings core and the command
 * autocomplete share it without the core depending on discord.js.
 */
export interface Choice {
	readonly name: string;
	readonly value: string | number;
}
