import { describe, expect, it } from "vitest";
import { formatSettingValue } from "@/modules/demo/config/format-setting-value";
import { DEMO_MESSAGES } from "@/modules/demo/demo-catalog";
import { demoSettings } from "@/modules/demo/demo-settings";

/** Echo the key, so an assertion names the catalog entry a value renders with. */
const t = (key: string) => key;

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
