import { describe, expect, it } from "vitest";
import { DEMO_MESSAGES } from "@/modules/demo/demo-catalog";
import { demoSettings } from "@/modules/demo/demo-settings";
import { formatSettingValue, parseValueInput } from "@/modules/demo/setting-text";

/** Echo the key, so an assertion names the catalog entry a value renders with. */
const t = (key: string) => key;

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

describe("formatSettingValue", () => {
	const { fields } = demoSettings;

	it("renders an unset value as not set", () => {
		expect(formatSettingValue({ spec: fields.staffRole.spec, value: undefined, t })).toBe(
			DEMO_MESSAGES.notSet,
		);
	});

	it("renders channels and roles as mentions, lists item by item", () => {
		expect(formatSettingValue({ spec: fields.logChannel.spec, value: "1", t })).toBe("<#1>");
		expect(formatSettingValue({ spec: fields.pingRoles.spec, value: ["2", "3"], t })).toBe(
			"<@&2>, <@&3>",
		);
	});

	it("never renders a secret, only whether it is set", () => {
		expect(formatSettingValue({ spec: fields.apiKey.spec, value: { isSet: true }, t })).toBe(
			DEMO_MESSAGES.secretSet,
		);
	});

	it("renders each toggle with its state", () => {
		expect(
			formatSettingValue({ spec: fields.features.spec, value: { welcome: true, logs: false }, t }),
		).toBe(`welcome: ${DEMO_MESSAGES.on}, logs: ${DEMO_MESSAGES.off}`);
	});
});
