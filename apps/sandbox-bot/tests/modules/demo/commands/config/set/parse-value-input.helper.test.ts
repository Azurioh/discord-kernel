import { describe, expect, it } from "vitest";
import { parseValueInput } from "@/modules/demo/commands/config/set/parse-value-input.helper";

describe("parseValueInput", () => {
	it.each([
		["42", 42],
		["true", true],
		['["1","2"]', ["1", "2"]],
		['{"logs":true}', { logs: true }],
		['"quoted"', "quoted"],
	])("parses the JSON %s", (input, expected) => {
		expect(parseValueInput(input)).toEqual(expected);
	});

	it("keeps text that is not JSON", () => {
		expect(parseValueInput("#ff0000")).toBe("#ff0000");
	});

	it("keeps a snowflake as text rather than rounding it", () => {
		expect(parseValueInput("123456789012345678")).toBe("123456789012345678");
	});
});
