import { describe, expect, it } from "vitest";
import {
	addGuildDays,
	dayString,
	endOfGuildDay,
	isValidWallClock,
	startOfGuildDay,
	startOfNextGuildWeek,
	zonedWallClockToUtc,
} from "@/datetime";

describe("zonedWallClockToUtc", () => {
	it("anchors a winter wall-clock to Europe/Paris (CET, UTC+1)", () => {
		expect(zonedWallClockToUtc("2026-01-15 14:00", "Europe/Paris").toISOString()).toBe(
			"2026-01-15T13:00:00.000Z",
		);
	});

	it("anchors a summer wall-clock to Europe/Paris (CEST, UTC+2)", () => {
		expect(zonedWallClockToUtc("2026-07-15 14:00", "Europe/Paris").toISOString()).toBe(
			"2026-07-15T12:00:00.000Z",
		);
	});

	it("is an identity for UTC", () => {
		expect(zonedWallClockToUtc("2026-03-15 14:00", "UTC").toISOString()).toBe(
			"2026-03-15T14:00:00.000Z",
		);
	});

	it("defaults a date-only input to midnight", () => {
		expect(zonedWallClockToUtc("2026-03-15", "UTC").toISOString()).toBe("2026-03-15T00:00:00.000Z");
	});

	it("throws RangeError on a malformed input", () => {
		expect(() => zonedWallClockToUtc("not-a-date", "UTC")).toThrow(RangeError);
	});
});

describe("isValidWallClock", () => {
	it("accepts date-only, date-time and T-separated forms", () => {
		expect(isValidWallClock("2026-03-15")).toBe(true);
		expect(isValidWallClock("2026-03-15 14:00")).toBe(true);
		expect(isValidWallClock("2026-03-15T14:00:00")).toBe(true);
	});

	it("rejects impossible calendar values the regex alone would allow", () => {
		expect(isValidWallClock("2026-13-01")).toBe(false);
		expect(isValidWallClock("2026-02-30")).toBe(false);
		expect(isValidWallClock("2026-03-32 14:00")).toBe(false);
		expect(isValidWallClock("2026-03-15 25:00")).toBe(false);
	});

	it("rejects garbage and empty input", () => {
		expect(isValidWallClock("garbage")).toBe(false);
		expect(isValidWallClock("")).toBe(false);
	});
});

describe("dayString", () => {
	it("extracts the YYYY-MM-DD portion", () => {
		expect(dayString(new Date("2026-03-15T14:00:00Z"))).toBe("2026-03-15");
	});
});

describe("startOfGuildDay / endOfGuildDay", () => {
	it("bracket a guild-local day in a non-UTC timezone", () => {
		const day = new Date("2026-01-15T00:00:00Z");
		expect(startOfGuildDay(day, "Europe/Paris").toISOString()).toBe("2026-01-14T23:00:00.000Z");
		expect(endOfGuildDay(day, "Europe/Paris").toISOString()).toBe("2026-01-15T22:59:59.000Z");
	});
});

describe("startOfNextGuildWeek", () => {
	it("returns next Monday 00:00 guild-local when reference is mid-week", () => {
		// 2026-03-18 is a Wednesday.
		const reference = new Date("2026-03-18T10:00:00Z");
		expect(startOfNextGuildWeek(reference, "UTC").toISOString()).toBe("2026-03-23T00:00:00.000Z");
	});

	it("skips a full week when reference is already a Monday", () => {
		// 2026-03-16 is a Monday.
		const reference = new Date("2026-03-16T10:00:00Z");
		expect(startOfNextGuildWeek(reference, "UTC").toISOString()).toBe("2026-03-23T00:00:00.000Z");
	});

	it("anchors to the guild timezone, not UTC, near a day boundary", () => {
		// 2026-03-18 23:30 UTC is already 2026-03-19 (Thursday) in Europe/Paris
		// (UTC+1 in March before DST) — the guild-local weekday must be used.
		const reference = new Date("2026-03-18T23:30:00Z");
		expect(startOfNextGuildWeek(reference, "Europe/Paris").toISOString()).toBe(
			"2026-03-22T23:00:00.000Z",
		);
	});
});
describe("addGuildDays", () => {
	it("advances by exactly N guild-local calendar days across a DST transition", () => {
		// 2026-03-23 00:00 Europe/Paris is CET (UTC+1); 7 days later crosses the
		// March 29 spring-forward, so the guild-local midnight lands on CEST
		// (UTC+2) — a fixed 7*24h offset would land at 23:00 the day before.
		const start = new Date("2026-03-22T23:00:00.000Z"); // 2026-03-23 00:00 CET
		const result = addGuildDays(start, 7, "Europe/Paris");
		expect(result.toISOString()).toBe("2026-03-29T22:00:00.000Z"); // 2026-03-30 00:00 CEST
	});

	it("is a plain 7-day advance in a fixed-offset timezone", () => {
		const start = new Date("2026-03-23T00:00:00.000Z");
		const result = addGuildDays(start, 7, "UTC");
		expect(result.toISOString()).toBe("2026-03-30T00:00:00.000Z");
	});
});
