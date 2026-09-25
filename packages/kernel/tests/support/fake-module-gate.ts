import type { ModuleGate } from "@/settings/system/module-gate";

/**
 * A {@link ModuleGate} double: every module is enabled except the ones listed
 * for a guild. `isEnabled` is a plain function, so a suite can spy on it.
 *
 * @param disabled - module names turned off, by guild id.
 */
export function createFakeModuleGate(
	disabled: Readonly<Record<string, readonly string[]>> = {},
): ModuleGate {
	return {
		isEnabled: async (moduleName, guildId) => !(disabled[guildId] ?? []).includes(moduleName),
	};
}
