import type { ModuleGate } from "@/settings/system/module-gate";

/** A {@link ModuleGate} whose answers a test switches per guild. */
export interface InMemoryModuleGate extends ModuleGate {
	disable(moduleName: string, guildId: string): void;
	enable(moduleName: string, guildId: string): void;
}

/**
 * The in-memory twin of {@link ModuleGate}: every module is enabled except the
 * ones disabled for a guild.
 *
 * @param disabled - module names turned off, by guild id; copied, never kept.
 */
export function createInMemoryModuleGate(
	disabled: Readonly<Record<string, readonly string[]>> = {},
): InMemoryModuleGate {
	const off = new Map<string, Set<string>>(
		Object.entries(disabled).map(([guildId, modules]) => [guildId, new Set(modules)]),
	);
	const offIn = (guildId: string): Set<string> => {
		const modules = off.get(guildId) ?? new Set<string>();
		off.set(guildId, modules);
		return modules;
	};

	return {
		async isEnabled(moduleName, guildId) {
			return !(off.get(guildId)?.has(moduleName) ?? false);
		},
		disable(moduleName, guildId) {
			offIn(guildId).add(moduleName);
		},
		enable(moduleName, guildId) {
			off.get(guildId)?.delete(moduleName);
		},
	};
}
