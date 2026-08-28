import { describe, expect, it } from "vitest";
import { boolEnv, enumEnv, optionalEnv, requireEnv } from "@/config/env";
import { InvalidEnvError, MissingEnvError } from "@/config/errors";

describe("env helpers", () => {
	it("returns a present required variable", () => {
		expect(requireEnv("KEY", { KEY: "value" })).toBe("value");
	});

	it("throws MissingEnvError when a required variable is absent or blank", () => {
		expect(() => requireEnv("KEY", {})).toThrow(MissingEnvError);
		expect(() => requireEnv("KEY", { KEY: "   " })).toThrow(MissingEnvError);
	});

	it("falls back when an optional variable is absent", () => {
		expect(optionalEnv("KEY", "fallback", {})).toBe("fallback");
		expect(optionalEnv("KEY", "fallback", { KEY: "set" })).toBe("set");
	});

	it("parses booleans loosely", () => {
		expect(boolEnv("KEY", false, { KEY: "true" })).toBe(true);
		expect(boolEnv("KEY", false, { KEY: "1" })).toBe(true);
		expect(boolEnv("KEY", true, { KEY: "no" })).toBe(false);
		expect(boolEnv("KEY", true, {})).toBe(true);
	});

	it("validates enums and falls back", () => {
		const levels = ["info", "warn"] as const;
		expect(enumEnv("KEY", levels, "info", { KEY: "warn" })).toBe("warn");
		expect(enumEnv("KEY", levels, "info", {})).toBe("info");
		expect(() => enumEnv("KEY", levels, "info", { KEY: "nope" })).toThrow(InvalidEnvError);
	});
});
