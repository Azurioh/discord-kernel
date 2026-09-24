import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";

/**
 * Discord answers a rate limit with an HTTP status, not a JSON error code, so
 * this one cannot come from {@link RESTJSONErrorCodes}.
 */
const TOO_MANY_REQUESTS_STATUS = 429;

/**
 * Codes meaning "the entity you asked about no longer exists". They are benign:
 * a channel was deleted, a member left, a message was removed, an interaction
 * token expired. The right reaction is to clean up local state, never to alert.
 */
const UNKNOWN_RESOURCE_CODES: ReadonlySet<number> = new Set([
	RESTJSONErrorCodes.UnknownAccount,
	RESTJSONErrorCodes.UnknownApplication,
	RESTJSONErrorCodes.UnknownChannel,
	RESTJSONErrorCodes.UnknownGuild,
	RESTJSONErrorCodes.UnknownIntegration,
	RESTJSONErrorCodes.UnknownInvite,
	RESTJSONErrorCodes.UnknownMember,
	RESTJSONErrorCodes.UnknownMessage,
	RESTJSONErrorCodes.UnknownPermissionOverwrite,
	RESTJSONErrorCodes.UnknownRole,
	RESTJSONErrorCodes.UnknownToken,
	RESTJSONErrorCodes.UnknownUser,
	RESTJSONErrorCodes.UnknownEmoji,
	RESTJSONErrorCodes.UnknownWebhook,
	RESTJSONErrorCodes.UnknownBan,
	RESTJSONErrorCodes.UnknownGuildTemplate,
	RESTJSONErrorCodes.UnknownSticker,
	RESTJSONErrorCodes.UnknownInteraction,
	RESTJSONErrorCodes.UnknownApplicationCommand,
	RESTJSONErrorCodes.UnknownVoiceState,
	RESTJSONErrorCodes.UnknownStageInstance,
]);

/** Codes meaning the bot is simply not allowed to do this — actionable by an admin. */
const MISSING_ACCESS_CODES: ReadonlySet<number> = new Set([
	RESTJSONErrorCodes.MissingAccess,
	RESTJSONErrorCodes.MissingPermissions,
]);

/** Codes Discord uses for a per-resource throttle, alongside the HTTP 429 status. */
const RATE_LIMIT_CODES: ReadonlySet<number> = new Set([
	RESTJSONErrorCodes.ChannelSendRateLimit,
	RESTJSONErrorCodes.ServerSendRateLimit,
	RESTJSONErrorCodes.ServiceResourceIsBeingRateLimited,
]);

/**
 * Narrow an unknown rejection to a Discord REST error. Adapters catch `unknown`,
 * so every predicate below starts here rather than trusting a `code` property
 * that any object could carry.
 */
export function isDiscordAPIError(error: unknown): error is DiscordAPIError {
	return error instanceof DiscordAPIError;
}

/**
 * The targeted guild/channel/member/message/interaction is gone. Treat as a
 * benign outcome: drop the stale reference instead of logging an incident.
 */
export function isUnknownResource(error: unknown): boolean {
	if (!isDiscordAPIError(error)) {
		return false;
	}
	return typeof error.code === "number" && UNKNOWN_RESOURCE_CODES.has(error.code);
}

/**
 * The bot lacks a permission or access to the resource. Actionable by a server
 * admin, so it deserves a clear message rather than a generic incident.
 */
export function isMissingAccess(error: unknown): boolean {
	if (!isDiscordAPIError(error)) {
		return false;
	}
	return typeof error.code === "number" && MISSING_ACCESS_CODES.has(error.code);
}

/** Discord is throttling us: back off and retry rather than surface a failure. */
export function isRateLimited(error: unknown): boolean {
	if (!isDiscordAPIError(error)) {
		return false;
	}
	if (error.status === TOO_MANY_REQUESTS_STATUS) {
		return true;
	}
	return typeof error.code === "number" && RATE_LIMIT_CODES.has(error.code);
}
