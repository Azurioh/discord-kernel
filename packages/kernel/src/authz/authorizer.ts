/** Permission tiers, lowest to highest. `editor` implies `viewer`. */
export type PermissionLevel = "viewer" | "editor";

/** Numeric rank for comparing levels (`editor` ≥ `viewer`). */
export const LEVEL_RANK: Record<PermissionLevel, number> = {
	viewer: 1,
	editor: 2,
};

/** A single grant: either a role or a user, at a given level. */
export interface PermissionGrant {
	readonly targetType: "role" | "user";
	readonly targetId: string;
	readonly level: PermissionLevel;
}

/** The full set of grants, split by target kind for cheap resolution. */
export interface PermissionGrants {
	readonly roles: Record<string, PermissionLevel>;
	readonly users: Record<string, PermissionLevel>;
}

/**
 * Cross-cutting authorization port for feature-level permission tiers (as
 * opposed to Discord's own per-command `defaultMemberPermissions`/guild
 * permissions, which gate *visibility* and native capabilities). A module
 * grants a role or a user a level; a guard checks whether a member meets the
 * level required for an action.
 *
 * Deliberately has no notion of "admin": a bot-wide administrator bypass is a
 * Discord permission concern, composed at the guard level with
 * `anyOf(createPermissionGuard([Administrator]), requireLevel(...))` — keeping
 * this port focused on the one thing it owns, feature-level grants.
 */
export interface Authorizer {
	/** Whether the user (directly, or via one of their roles) meets `required`. */
	meetsLevel(
		userId: string,
		roleIds: readonly string[],
		required: PermissionLevel,
	): Promise<boolean>;
	grantRole(roleId: string, level: PermissionLevel): Promise<void>;
	grantUser(userId: string, level: PermissionLevel): Promise<void>;
	/** Returns whether a grant existed to remove. */
	revokeRole(roleId: string): Promise<boolean>;
	/** Returns whether a grant existed to remove. */
	revokeUser(userId: string): Promise<boolean>;
	listGrants(): Promise<PermissionGrants>;
}

/**
 * Shared resolution used by every adapter: a direct user grant wins over role
 * grants; otherwise the highest matching role level applies. Returns whether
 * the resolved level meets `required`.
 */
export function meetsResolvedLevel(
	grants: PermissionGrants,
	userId: string,
	roleIds: readonly string[],
	required: PermissionLevel,
): boolean {
	const userLevel = grants.users[userId];
	let resolved: PermissionLevel | null = userLevel ?? null;
	if (!resolved) {
		for (const roleId of roleIds) {
			const roleLevel = grants.roles[roleId];
			if (roleLevel && (!resolved || LEVEL_RANK[roleLevel] > LEVEL_RANK[resolved])) {
				resolved = roleLevel;
			}
		}
	}
	if (!resolved) {
		return false;
	}
	return LEVEL_RANK[resolved] >= LEVEL_RANK[required];
}
