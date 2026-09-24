import { describe, expect, it } from "vitest";
import { DISCORD_BLURPLE } from "@/color";
import {
	COLOR_ALIASES,
	MAX_COLOR_INPUT_LENGTH,
	parseColorInput,
	registerColorAliases,
} from "@/discord/ui/color-input";
import { ColorAliasTooLongError } from "@/discord/ui/color-input-errors";

const HEX_PATTERN = /^#[0-9a-f]{6}$/;

/** Every name an administrator may type, with the pair it belongs to. */
const NAME_PAIRS = [
	["red", "rouge"],
	["blue", "bleu"],
	["green", "vert"],
	["yellow", "jaune"],
	["purple", "violet"],
	["pink", "rose"],
	["white", "blanc"],
	["black", "noir"],
	["grey", "gris"],
	["gray", "gris"],
	["brown", "marron"],
	["silver", "argent"],
	["navy", "marine"],
] as const;

describe("the colour alias table", () => {
	it("resolves every name it holds to a `#rrggbb` value", () => {
		for (const [name, hex] of Object.entries(COLOR_ALIASES)) {
			expect(hex, name).toMatch(HEX_PATTERN);
			expect(parseColorInput(name), name).toBe(hex);
		}
	});

	it("gives a colour's French and English names the same value", () => {
		for (const [english, french] of NAME_PAIRS) {
			expect(parseColorInput(french), french).toBe(parseColorInput(english));
		}
	});

	it("ignores case and surrounding whitespace", () => {
		expect(parseColorInput("  Rouge  ")).toBe(parseColorInput("red"));
		expect(parseColorInput("BLEU")).toBe(parseColorInput("blue"));
		expect(parseColorInput("Turquoise")).toBe(parseColorInput("turquoise"));
	});

	/** An admin has no way of knowing which spelling this table happened to use. */
	it("accepts an accented name typed without its accent, and the reverse", () => {
		expect(parseColorInput("argenté")).toBe(parseColorInput("argente"));
		expect(parseColorInput("ARGENTÉ")).toBe(parseColorInput("silver"));
	});

	/** One hex for Discord's own colour, shared with the default palette. */
	it("resolves blurple to the same value the default palette uses", () => {
		expect(parseColorInput("blurple")).toBe(DISCORD_BLURPLE);
	});

	/** Discord reads a zero colour as "no colour set" and shows its default bar. */
	it("keeps black off zero, so it renders as black instead of as nothing", () => {
		const black = parseColorInput("noir");
		if (black === null) {
			throw new Error("expected `noir` to resolve to a colour");
		}
		expect(Number.parseInt(black.slice(1), 16)).toBeGreaterThan(0);
	});

	it("lets the field carry the longest name it offers", () => {
		for (const name of Object.keys(COLOR_ALIASES)) {
			expect(name.length, name).toBeLessThanOrEqual(MAX_COLOR_INPUT_LENGTH);
		}
	});
});

describe("parseColorInput on hexadecimal input", () => {
	it("still accepts the long form, with or without the hash", () => {
		expect(parseColorInput("#5865F2")).toBe("#5865f2");
		expect(parseColorInput("5865f2")).toBe("#5865f2");
	});

	it("still expands the short form", () => {
		expect(parseColorInput("#58f")).toBe("#5588ff");
	});

	it("still trims what it is given", () => {
		expect(parseColorInput("  #5865f2  ")).toBe("#5865f2");
	});

	it("returns null for anything that is neither a name nor a hex code", () => {
		expect(parseColorInput("bleu ciel")).toBeNull();
		expect(parseColorInput("rouges")).toBeNull();
		expect(parseColorInput("#12345")).toBeNull();
		expect(parseColorInput("")).toBeNull();
	});
});

/**
 * Registration is global and permanent, like the palette it sits beside: these
 * run last so the names they add cannot reach the tables above.
 */
describe("registerColorAliases", () => {
	it("teaches the parser a name the kernel does not ship", () => {
		expect(parseColorInput("teal")).toBeNull();

		registerColorAliases({ teal: "#008080" });

		expect(parseColorInput("teal")).toBe("#008080");
	});

	it("folds a registered name the same way as a built-in one", () => {
		registerColorAliases({ sablé: "#e6d3a3" });

		expect(parseColorInput("  SABLE  ")).toBe("#e6d3a3");
	});

	it("lets a bot override a name the kernel ships", () => {
		registerColorAliases({ orange: "#ff7f00" });

		expect(parseColorInput("orange")).toBe("#ff7f00");
	});

	/**
	 * The field is already sized from the built-in table, so a longer name would
	 * be cut short at the client and then never resolve — a colour the bot
	 * advertises and refuses.
	 */
	it("refuses a name the input field could not carry", () => {
		const tooLong = "x".repeat(MAX_COLOR_INPUT_LENGTH + 1);

		expect(() => registerColorAliases({ [tooLong]: "#000001" })).toThrow(ColorAliasTooLongError);
		expect(parseColorInput(tooLong)).toBeNull();
	});
});
