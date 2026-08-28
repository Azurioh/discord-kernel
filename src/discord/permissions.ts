import { PermissionFlagsBits, PermissionsBitField } from "discord.js";

/**
 * Permission helpers shared by the command DSL, the guards and any adapter that
 * needs to reason about what the bot (or a member) is allowed to do.
 *
 * Everything is expressed in terms of {@link PermissionBit} rather than raw
 * `bigint`s: the values come from discord.js' `PermissionFlagsBits`, so a typo
 * is a type error instead of a silently wrong bitfield.
 */

/**
 * A single Discord permission flag. Deriving the type from the enum-like object
 * means the DSL accepts `PermissionFlagsBits.ManageChannels` and rejects an
 * arbitrary `bigint`.
 */
export type PermissionBit = (typeof PermissionFlagsBits)[keyof typeof PermissionFlagsBits];

/** Combine permission flags into the single bitfield Discord's API expects. */
export function resolvePermissions(permissions: readonly PermissionBit[]): bigint {
	return PermissionsBitField.resolve([...permissions]);
}

/**
 * Bits in `required` that `held` lacks (empty when everything is granted).
 *
 * `held === null` means the permissions could not be resolved (outside a guild,
 * or an uncached member). It returns *all* of `required`: an absent answer must
 * never be mistaken for a granted one.
 */
export function missingPermissions(
	held: Readonly<PermissionsBitField> | null,
	required: readonly PermissionBit[],
): PermissionBit[] {
	if (held === null) {
		return [...required];
	}
	return required.filter((permission) => !held.has(permission));
}

/**
 * Human-readable names for permission bits, for user-facing messages. Resolved
 * by reverse lookup in `PermissionFlagsBits` so the names track discord.js
 * rather than a hand-maintained table that silently rots.
 */
export function formatPermissions(permissions: readonly PermissionBit[]): string {
	return permissions.map(permissionName).join(", ");
}

function permissionName(permission: PermissionBit): string {
	for (const [name, bit] of Object.entries(PermissionFlagsBits)) {
		if (bit === permission) {
			return name;
		}
	}
	return String(permission);
}
