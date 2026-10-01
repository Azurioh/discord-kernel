import {
	type Authorizer,
	meetsResolvedLevel,
	type PermissionGrants,
	type PermissionLevel,
} from "@/authz/authorizer";

/**
 * {@link Authorizer} that keeps its grants in memory: the twin a bot's tests
 * use, and a working adapter for a bot that needs no persistence.
 *
 * @param initial - grants to start from; copied, never kept.
 */
export function createInMemoryAuthorizer(initial?: PermissionGrants): Authorizer {
	const roles = new Map<string, PermissionLevel>(Object.entries(initial?.roles ?? {}));
	const users = new Map<string, PermissionLevel>(Object.entries(initial?.users ?? {}));
	const grants = (): PermissionGrants => ({
		roles: Object.fromEntries(roles),
		users: Object.fromEntries(users),
	});

	return {
		async meetsLevel(userId, roleIds, required) {
			return meetsResolvedLevel(grants(), userId, roleIds, required);
		},
		async grantRole(roleId, level) {
			roles.set(roleId, level);
		},
		async grantUser(userId, level) {
			users.set(userId, level);
		},
		async revokeRole(roleId) {
			return roles.delete(roleId);
		},
		async revokeUser(userId) {
			return users.delete(userId);
		},
		async listGrants() {
			return grants();
		},
	};
}
