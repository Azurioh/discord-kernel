import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";
import { describe, expect, it } from "vitest";
import { isMissingAccess, isRateLimited, isUnknownResource } from "@/discord/api-errors";

const REQUEST_METHOD = "GET";
const REQUEST_URL = "https://discord.com/api/v10/channels/1";
const NOT_FOUND_STATUS = 404;
const FORBIDDEN_STATUS = 403;
const TOO_MANY_REQUESTS_STATUS = 429;

/** Build a real REST error: the predicates narrow with `instanceof`, not duck typing. */
function createApiError(code: number, status: number): DiscordAPIError {
	return new DiscordAPIError(
		{ code, message: "Test error" },
		code,
		status,
		REQUEST_METHOD,
		REQUEST_URL,
		{},
	);
}

/** Same shape as a REST error, wrong prototype — every predicate must reject it. */
const lookalike = Object.assign(new Error("Unknown Message"), {
	code: RESTJSONErrorCodes.UnknownMessage,
	status: NOT_FOUND_STATUS,
});

describe("isUnknownResource", () => {
	it("flags a deleted channel", () => {
		expect(
			isUnknownResource(createApiError(RESTJSONErrorCodes.UnknownChannel, NOT_FOUND_STATUS)),
		).toBe(true);
	});

	it("flags a deleted message", () => {
		expect(
			isUnknownResource(createApiError(RESTJSONErrorCodes.UnknownMessage, NOT_FOUND_STATUS)),
		).toBe(true);
	});

	it("flags an expired interaction", () => {
		expect(
			isUnknownResource(createApiError(RESTJSONErrorCodes.UnknownInteraction, NOT_FOUND_STATUS)),
		).toBe(true);
	});

	it("does not flag a permission failure", () => {
		expect(
			isUnknownResource(createApiError(RESTJSONErrorCodes.MissingAccess, FORBIDDEN_STATUS)),
		).toBe(false);
	});

	it("rejects a plain error", () => {
		expect(isUnknownResource(new Error("boom"))).toBe(false);
	});

	it("rejects an error that merely looks like a REST error", () => {
		expect(isUnknownResource(lookalike)).toBe(false);
	});
});

describe("isMissingAccess", () => {
	it("flags missing access", () => {
		expect(
			isMissingAccess(createApiError(RESTJSONErrorCodes.MissingAccess, FORBIDDEN_STATUS)),
		).toBe(true);
	});

	it("flags missing permissions", () => {
		expect(
			isMissingAccess(createApiError(RESTJSONErrorCodes.MissingPermissions, FORBIDDEN_STATUS)),
		).toBe(true);
	});

	it("does not flag a missing entity", () => {
		expect(isMissingAccess(createApiError(RESTJSONErrorCodes.UnknownGuild, NOT_FOUND_STATUS))).toBe(
			false,
		);
	});

	it("rejects a plain error", () => {
		expect(isMissingAccess(new Error("boom"))).toBe(false);
	});

	it("rejects an error that merely looks like a REST error", () => {
		expect(isMissingAccess(lookalike)).toBe(false);
	});
});

describe("isRateLimited", () => {
	it("flags the 429 status, which carries no JSON error code", () => {
		expect(isRateLimited(createApiError(TOO_MANY_REQUESTS_STATUS, TOO_MANY_REQUESTS_STATUS))).toBe(
			true,
		);
	});

	it("flags a per-channel send throttle", () => {
		expect(
			isRateLimited(createApiError(RESTJSONErrorCodes.ChannelSendRateLimit, FORBIDDEN_STATUS)),
		).toBe(true);
	});

	it("does not flag an unrelated failure", () => {
		expect(isRateLimited(createApiError(RESTJSONErrorCodes.UnknownChannel, NOT_FOUND_STATUS))).toBe(
			false,
		);
	});

	it("rejects a plain error", () => {
		expect(isRateLimited(new Error("boom"))).toBe(false);
	});

	it("rejects an error that merely looks like a REST error", () => {
		expect(isRateLimited(Object.assign(new Error("rate limited"), { status: 429 }))).toBe(false);
	});
});
