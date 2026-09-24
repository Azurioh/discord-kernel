import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { Options } from "@azurioh/discord-kernel/discord/command/options";
import { CORE_MESSAGES } from "@azurioh/discord-kernel/discord/i18n";
import { ValidationError } from "@azurioh/discord-kernel/errors/business-error";
import type { RequestContext } from "@azurioh/discord-kernel/settings";

/**
 * Who asks, where and in which language, for the settings service.
 *
 * @throws ValidationError outside a guild; the guild-only guard runs first, so
 * this only holds the type system to what the guard already enforced.
 */
export function requestContext<O extends Options>(ctx: Context<O>): RequestContext {
	const { guildId, user } = ctx.interaction;
	if (guildId === null) {
		throw new ValidationError("/config needs a guild", { key: CORE_MESSAGES.guardGuildOnly });
	}
	return { guildId, userId: user.id, locale: ctx.locale };
}
