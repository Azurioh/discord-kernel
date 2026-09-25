import type { BotModule } from "@azurioh/discord-kernel/module/module";
import {
	createServerCommand,
	type ServerCommandDeps,
} from "@/modules/admin/commands/server/server.command";
import { ADMIN_CATALOG } from "@/modules/admin/i18n/admin.catalog";

/**
 * What the admin module needs. The settings service and the kernel
 * declaration are resolved on each use: the composition root builds both
 * after collecting every module.
 */
export type AdminModuleDeps = ServerCommandDeps;

/**
 * Server administration: `/server` toggles the other modules and picks the
 * bot's language. Always on, so disabling a module can never lock the
 * administrator out of turning it back on.
 *
 * @param deps - where the commands deploy, the settings service, the kernel declaration and the translator.
 */
export function createAdminModule(deps: AdminModuleDeps): BotModule {
	return {
		name: "admin",
		defaultEnabled: true,
		commands: [createServerCommand(deps)],
		translations: ADMIN_CATALOG,
	};
}
