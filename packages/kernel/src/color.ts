/**
 * The generic web colours, at the value the name carries everywhere else — an
 * administrator typing `orange` gets the orange they would get in CSS, not a
 * shade this module invented.
 */
const RED = "#ff0000";
const BLUE = "#0000ff";
const GREEN = "#008000";
const YELLOW = "#ffff00";
const ORANGE = "#ffa500";
const PURPLE = "#800080";
const PINK = "#ffc0cb";
const WHITE = "#ffffff";

/**
 * Discord's own brand colour. Kept with the base names rather than in the
 * Discord ring so a `blurple` setting means the same colour on every surface,
 * and so embeds fall back to it when a bot declares no palette.
 */
export const DISCORD_BLURPLE = "#5865f2";

/**
 * Not `#000000`: Discord reads a zero colour as "no colour set" and renders the
 * default grey bar instead, so pure black is the one value an administrator
 * could ask for and never see. One step off zero reads as black.
 */
const BLACK = "#010101";

const GREY = "#808080";
const CYAN = "#00ffff";
const BROWN = "#a52a2a";
const SILVER = "#c0c0c0";
const TURQUOISE = "#40e0d0";
const MAGENTA = "#ff00ff";
const NAVY = "#000080";

/**
 * Colour names an administrator may type instead of a hex code, French and
 * English side by side.
 *
 * This table is **input vocabulary, not display text**. Nothing in it is ever
 * shown to anyone, and its keys must never be translated at runtime: a catalog
 * lookup resolves against the reply locale, which would make `rouge` stop
 * working the moment an admin's Discord is set to English — the opposite of the
 * point. Both spellings are accepted from everyone, always, which only a flat
 * table can promise.
 *
 * Fixed on purpose: a value stored from one of these names must mean the same
 * colour in every bot. Names a bot adds for its own inputs live with those
 * inputs, not here.
 */
export const BASE_COLOR_NAMES: Readonly<Record<string, string>> = {
	red: RED,
	rouge: RED,
	blue: BLUE,
	bleu: BLUE,
	green: GREEN,
	vert: GREEN,
	yellow: YELLOW,
	jaune: YELLOW,
	orange: ORANGE,
	purple: PURPLE,
	// French for purple, not the CSS `violet` (a pale pink): an admin typing it
	// here is asking for the colour the word means in their own language.
	violet: PURPLE,
	pink: PINK,
	rose: PINK,
	white: WHITE,
	blanc: WHITE,
	black: BLACK,
	noir: BLACK,
	grey: GREY,
	gray: GREY,
	gris: GREY,
	cyan: CYAN,
	brown: BROWN,
	marron: BROWN,
	silver: SILVER,
	argent: SILVER,
	argenté: SILVER,
	turquoise: TURQUOISE,
	magenta: MAGENTA,
	navy: NAVY,
	marine: NAVY,
	blurple: DISCORD_BLURPLE,
};

/**
 * Accents must not be a trap: `dore` and `doré` are the same request, and an
 * administrator has no way of knowing which one a table happened to spell.
 * Case and surrounding whitespace are folded for the same reason.
 */
export function normalizeColorName(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
}

/** Index a name → `#rrggbb` table by {@link normalizeColorName}, so lookups fold case and accents. */
export function indexColorNames(names: Readonly<Record<string, string>>): Map<string, string> {
	return new Map(Object.entries(names).map(([name, hex]) => [normalizeColorName(name), hex]));
}

const BASE_COLORS_BY_NORMALIZED_NAME: ReadonlyMap<string, string> =
	indexColorNames(BASE_COLOR_NAMES);

/** `#RGB` and `#RRGGBB`, with or without the leading hash. */
const HEX_COLOR_PATTERN = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Normalize a hexadecimal colour code to `#rrggbb`, `null` when the input is
 * not one. Surrounding whitespace is ignored.
 */
export function parseHexColor(raw: string): string | null {
	const value = raw.trim();
	if (!HEX_COLOR_PATTERN.test(value)) {
		return null;
	}
	const digits = value.replace("#", "").toLowerCase();
	const expanded =
		digits.length === 3 ? [...digits].map((digit) => `${digit}${digit}`).join("") : digits;
	return `#${expanded}`;
}

/**
 * Normalize a colour to `#rrggbb`, from a hexadecimal code or from one of the
 * {@link BASE_COLOR_NAMES}. `null` for anything else: the refusal belongs to
 * whichever caller asked, so this only reports that it could not read the value.
 */
export function parseColor(raw: string): string | null {
	return BASE_COLORS_BY_NORMALIZED_NAME.get(normalizeColorName(raw)) ?? parseHexColor(raw);
}
