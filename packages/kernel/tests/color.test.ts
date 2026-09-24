import { describe, expect, it } from "vitest";
import { parseColor } from "@/color";

describe("parseColor", () => {
	it("normalises a hexadecimal code to #rrggbb", () => {
		expect(parseColor("#5865F2")).toBe("#5865f2");
		expect(parseColor("5865f2")).toBe("#5865f2");
		expect(parseColor("#58f")).toBe("#5588ff");
		expect(parseColor("  #5865f2  ")).toBe("#5865f2");
	});

	it("reads the base colour names in French and English, folding case and accents", () => {
		expect(parseColor("red")).toBe("#ff0000");
		expect(parseColor("  Rouge  ")).toBe("#ff0000");
		expect(parseColor("ARGENTÉ")).toBe(parseColor("silver"));
	});

	it("returns null for anything that is neither a hex code nor a base name", () => {
		expect(parseColor("bleu ciel")).toBeNull();
		expect(parseColor("#12345")).toBeNull();
		expect(parseColor("")).toBeNull();
	});
});
