import type { ComponentAuthorization } from "@/discord/components/component-router";
import type { PermissionBit } from "@/discord/permissions";

/** Any member may click; `because` records why that is acceptable. */
export function openToAnyone(because: string): ComponentAuthorization {
	return { kind: "anyone", because };
}

/** The router denies the click unless the member holds every permission. */
export function requiresPermissions(...required: readonly PermissionBit[]): ComponentAuthorization {
	return { kind: "permissions", required };
}

/**
 * The decision needs per-resource state, so the handler makes it. `because`
 * names the rule it applies, so a reviewer can go and check that it does.
 */
export function checkedByHandler(because: string): ComponentAuthorization {
	return { kind: "handler", because };
}
