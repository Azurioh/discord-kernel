import { describe, expect, it } from "vitest";
import { parseDuration } from "@/settings/duration";

describe("parseDuration", () => {
	it.each([
		["90s", 90],
		["15m", 900],
		["2h", 7200],
		["7d", 604_800],
		["1h30m", 5400],
		["1d2h3m4s", 93_784],
		["0s", 0],
	])("parses %s as %i seconds", (input, seconds) => {
		expect(parseDuration(input)).toBe(seconds);
	});

	it("ignores case, surrounding whitespace and spaces between parts", () => {
		expect(parseDuration("  1H 30M ")).toBe(5400);
	});

	it.each([
		"",
		"   ",
		"90",
		"s",
		"1.5h",
		"-5m",
		"30m1h",
		"1h1h",
		"1w",
		"1h30",
		"abc",
		"99999999999999999999d",
	])("rejects %j", (input) => {
		expect(parseDuration(input)).toBeUndefined();
	});
});
