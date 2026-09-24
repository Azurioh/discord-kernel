import type { CommandInteraction } from "discord.js";
import type { Guard, GuardResult } from "@/discord/command/guard";
import { CORE_MESSAGES } from "@/discord/i18n";
import { formatPermissions, missingPermissions, type PermissionBit } from "@/discord/permissions";
import type { LocalizedText } from "@/i18n/translator";

/**
 * Generic, reusable guards. They complement — never replace —
 * `defaultMemberPermissions` on a command: that field only *hides* the command
 * in the Discord client, and a server admin can override it in the Integrations
 * UI. The guard is the enforcement that actually runs server-side.
 */

const ALLOW: GuardResult = { ok: true };

/**
 * Deny unless the member holds every permission in `required`.
 *
 * `interaction.memberPermissions` is `null` outside a guild; that is a denial,
 * since an unknown permission set cannot be treated as a granted one.
 */
export function createPermissionGuard(
	required: readonly PermissionBit[],
	denyMessage?: LocalizedText,
): Guard {
	return {
		check(interaction: CommandInteraction): GuardResult {
			const missing = missingPermissions(interaction.memberPermissions, required);
			if (missing.length === 0) {
				return ALLOW;
			}
			return {
				ok: false,
				message: denyMessage ?? {
					key: CORE_MESSAGES.guardPermissionDenied,
					params: { missing: formatPermissions(missing) },
				},
			};
		},
	};
}

/**
 * Deny unless the member holds one of `roleIds`.
 *
 * Outside a guild there is no member and therefore no role: deny. The member's
 * role cache is authoritative here because `interactionCreate` always carries a
 * fully resolved member object for guild interactions.
 */
export function createRoleGuard(roleIds: readonly string[], denyMessage?: LocalizedText): Guard {
	return {
		check(interaction: CommandInteraction): GuardResult {
			const member = interaction.member;
			if (!member || !interaction.inCachedGuild()) {
				return { ok: false, message: denyMessage ?? { key: CORE_MESSAGES.guardGuildOnly } };
			}
			const held = interaction.member.roles.cache;
			if (roleIds.some((roleId) => held.has(roleId))) {
				return ALLOW;
			}
			return { ok: false, message: denyMessage ?? { key: CORE_MESSAGES.guardRoleDenied } };
		},
	};
}

/** Deny outside a guild, so a handler can rely on the guild context existing. */
export const guildOnlyGuard: Guard = {
	check(interaction: CommandInteraction): GuardResult {
		if (interaction.inGuild()) {
			return ALLOW;
		}
		return { ok: false, message: { key: CORE_MESSAGES.guardGuildOnly } };
	},
};
