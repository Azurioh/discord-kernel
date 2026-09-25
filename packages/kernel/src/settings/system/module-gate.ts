import { errorMessage } from "@/errors/error-message";
import type { Logger } from "@/logger";
import type { SettingsRegistry } from "@/settings/registry";
import type { SettingsService } from "@/settings/settings-service";

/**
 * Whether a module runs on a guild. The command, component and event routers
 * check it before running a module's handler there; scheduled jobs call it
 * themselves (FR-036).
 */
export interface ModuleGate {
	isEnabled(moduleName: string, guildId: string): Promise<boolean>;
}

/**
 * Create the gate over the guild's kernel settings (`registry.kernel`), read
 * through the service's cache, so checking it on every interaction does not
 * hit the store.
 *
 * A module the kernel declaration does not know is never gated. When the
 * settings cannot be read, the module runs and the error is logged: a store
 * outage must not switch every module off.
 *
 * @param deps.service - reads the guild's kernel settings.
 * @param deps.registry - holds the kernel declaration built from the modules.
 * @param deps.logger - where a failed read is reported.
 * @returns the gate shared by the routers and the scheduled jobs.
 */
export function createModuleGate(deps: {
	service: SettingsService;
	registry: SettingsRegistry;
	logger: Logger;
}): ModuleGate {
	const { service, registry, logger } = deps;
	return {
		async isEnabled(moduleName: string, guildId: string): Promise<boolean> {
			try {
				const { modules } = await service.get(registry.kernel, guildId);
				return modules[moduleName] ?? true;
			} catch (error) {
				logger.error(
					{ module: moduleName, guildId, err: errorMessage(error) },
					"Could not read whether the module is enabled; letting it run",
				);
				return true;
			}
		},
	};
}
