import { BASE_COLOR_NAMES, normalizeColorName, parseHexColor } from "@/color";
import { ColorAliasTooLongError } from "@/discord/ui/color-input-errors";
import { DISCORD_BLURPLE } from "@/discord/ui/colors";

/**
 * The names the kernel ships: the vendor-neutral base colours, plus Discord's
 * own brand colour, which only means something on a Discord surface.
 *
 * A bot adds its own — the colour it calls by its brand's name — through
 * {@link registerColorAliases}, which is also why this table is not the one
 * lookups read: {@link COLOR_ALIASES} is.
 */
const BUILT_IN_COLOR_ALIASES: Readonly<Record<string, string>> = {
	...BASE_COLOR_NAMES,
	blurple: DISCORD_BLURPLE,
};

/**
 * Every name a lookup answers to: the kernel's own, plus whatever the bot
 * registered. Exposed for inspection — a screen listing the colours it accepts
 * reads this — never for mutation, which goes through
 * {@link registerColorAliases} so the length check cannot be skipped.
 */
export const COLOR_ALIASES: Readonly<Record<string, string>> = {
	...BUILT_IN_COLOR_ALIASES,
};

const COLORS_BY_NORMALIZED_NAME = new Map(
	Object.entries(COLOR_ALIASES).map(([name, hex]) => [normalizeColorName(name), hex]),
);

/** The `#rrggbb` a recognised colour name stands for, `null` for anything else. */
function resolveNamedColor(raw: string): string | null {
	return COLORS_BY_NORMALIZED_NAME.get(normalizeColorName(raw)) ?? null;
}

/** `#RRGGBB` — the longest hexadecimal form the parser accepts. */
const HEX_INPUT_LENGTH = 7;

/**
 * What a colour input field may hold.
 *
 * Derived from the built-in table rather than written down, so adding a longer
 * name here cannot leave the field silently truncating it at the client — and
 * fixed rather than recomputed on registration, because field definitions read
 * it once at module load, long before a bot registers anything.
 */
export const MAX_COLOR_INPUT_LENGTH = Math.max(
	HEX_INPUT_LENGTH,
	...Object.keys(BUILT_IN_COLOR_ALIASES).map((name) => name.length),
);

/**
 * Teach the parser the colours this bot calls by name — its brand gold, its
 * team colours — from the composition root, before any module is constructed.
 *
 * A name over {@link MAX_COLOR_INPUT_LENGTH} is refused rather than accepted:
 * the input field is already sized, so registering a longer name would let an
 * administrator type a colour the client cuts short, which then reads as the
 * parser rejecting a name it actually knows.
 *
 * @throws ColorAliasTooLongError when a name cannot fit the input field.
 */
export function registerColorAliases(aliases: Readonly<Record<string, string>>): void {
	for (const [name, hex] of Object.entries(aliases)) {
		if (name.length > MAX_COLOR_INPUT_LENGTH) {
			throw new ColorAliasTooLongError(name, MAX_COLOR_INPUT_LENGTH);
		}
		// Both views are written: the table is what a screen lists, the map is what
		// a lookup reads, and a name present in one but not the other would be a
		// colour the bot advertises and refuses.
		(COLOR_ALIASES as Record<string, string>)[name] = hex;
		COLORS_BY_NORMALIZED_NAME.set(normalizeColorName(name), hex);
	}
}

/**
 * Normalize a colour input to `#RRGGBB`, from a hexadecimal code or from one of
 * the names in {@link COLOR_ALIASES} — an administrator picking a colour should
 * not have to look a hex code up. `null` for anything that is neither: the
 * refusal an administrator reads belongs to whichever screen asked, so core
 * reports that it could not read the value and leaves the wording to the caller.
 */
export function parseColorInput(raw: string): string | null {
	return resolveNamedColor(raw) ?? parseHexColor(raw);
}
