import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration } from "@/settings/duration";

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

describe("formatDuration", () => {
	it.each([
		[0, "0s"],
		[90, "1m30s"],
		[900, "15m"],
		[5400, "1h30m"],
		[93_784, "1d2h3m4s"],
	])("formats %i seconds as %s", (seconds, text) => {
		expect(formatDuration(seconds)).toBe(text);
	});

	it.each([0, 59, 3600, 93_784, 604_800])(
		"round-trips %i seconds through parseDuration",
		(seconds) => {
			expect(parseDuration(formatDuration(seconds))).toBe(seconds);
		},
	);
});
