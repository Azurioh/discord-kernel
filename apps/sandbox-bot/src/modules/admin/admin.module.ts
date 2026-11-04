import type { BotModule } from "@azurioh/discord-kernel/module/module";
import { createServerCommand } from "@/modules/admin/commands/server/server.command";
import { ADMIN_CATALOG } from "@/modules/admin/i18n/admin.catalog";

/** Always-on server administration, even when every guild toggle is off.
 * @param params - The guilds where commands deploy.
 * @returns The admin module with service-aware commands.
 */
export function createAdminModule(params: { guildIds: readonly string[] }): BotModule {
	return {
		name: "admin",
		gated: false,
		translations: ADMIN_CATALOG,
		build(context) {
			return {
				commands: [
					createServerCommand({
						...context,
						guildIds: params.guildIds,
						kernelSettings: context.registry.kernel,
					}),
				],
			};
		},
	};
}
