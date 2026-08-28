import { describe, expect, it } from "vitest";
import { normalizeLocale, resolveLocale } from "@/i18n";

describe("normalizeLocale", () => {
	it("collapses regional English variants to en", () => {
		expect(normalizeLocale("en-US")).toBe("en");
		expect(normalizeLocale("en-GB")).toBe("en");
	});

	it("accepts bare supported tags", () => {
		expect(normalizeLocale("fr")).toBe("fr");
		expect(normalizeLocale("en")).toBe("en");
	});

	it("returns undefined for unsupported languages", () => {
		expect(normalizeLocale("de")).toBeUndefined();
		expect(normalizeLocale("pt-BR")).toBeUndefined();
	});

	it("returns undefined for null, undefined and empty input", () => {
		expect(normalizeLocale(null)).toBeUndefined();
		expect(normalizeLocale(undefined)).toBeUndefined();
		expect(normalizeLocale("")).toBeUndefined();
	});
});

describe("resolveLocale", () => {
	it("picks the first supported candidate", () => {
		expect(resolveLocale(["fr", "en-US"], "en")).toBe("fr");
	});

	it("skips unsupported candidates and keeps walking the chain", () => {
		expect(resolveLocale(["de", "fr"], "en")).toBe("fr");
	});

	it("falls back to the default when no candidate is supported", () => {
		expect(resolveLocale(["de", "ja"], "fr")).toBe("fr");
	});

	it("falls back to the default when candidates are missing", () => {
		expect(resolveLocale([null, undefined], "en")).toBe("en");
	});
});
