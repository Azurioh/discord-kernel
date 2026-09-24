import type { BaseInteraction, CommandInteraction } from "discord.js";
import type { Authorizer, PermissionLevel } from "@/authz/authorizer";
import type { Guard } from "@/discord/command/guard";
import type { LocalizedText } from "@/i18n/translator";

/**
 * Role IDs held by the interacting member, resolved without a network call:
 * `interaction.member.roles` is either the cached `GuildMemberRoleManager` (a
 * cached-guild interaction) or a plain array of IDs (the raw API shape for an
 * uncached one) — both are handled so the guard never has to fetch the member.
 *
 * Typed on the base `Interaction`, not on the command flavour a guard takes: a
 * control clicked inside a message carries the member exactly the same way, and
 * a rule that has to hold on both paths must be able to ask both.
 */
export function memberRoleIds(interaction: BaseInteraction): string[] {
	const member = interaction.member;
	if (!member || typeof member !== "object" || !("roles" in member)) {
		return [];
	}
	const roles = member.roles;
	return Array.isArray(roles) ? roles : Array.from(roles.cache.keys());
}

/**
 * Deny unless the member meets `required` on the injected {@link Authorizer}
 * (directly, or via one of their roles). Compose with a Discord-permission
 * guard through `anyOf(...)` when a bot-wide administrator bypass is wanted —
 * this guard alone knows nothing about Discord permissions.
 */
export function requireLevel(
	authz: Authorizer,
	required: PermissionLevel,
	denyMessage: LocalizedText,
): Guard {
	return {
		async check(interaction: CommandInteraction) {
			const ok = await authz.meetsLevel(interaction.user.id, memberRoleIds(interaction), required);
			return ok ? { ok: true } : { ok: false, message: denyMessage };
		},
	};
}
