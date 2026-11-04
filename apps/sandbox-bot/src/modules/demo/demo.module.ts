import type { BotModule } from "@azurioh/discord-kernel/module/module";
import { createConfigCommand } from "@/modules/demo/commands/config/config.command";
import { createDemoLogCommand } from "@/modules/demo/commands/demo-log/demo-log.command";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo.catalog";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { demoSettings } from "@/modules/demo/settings/demo.settings";

/**
 * Declares settings of most kinds, serves them through `/config`, and needs
 * its required log channel for `/demo-log`.
 *
 * @param params - The guilds where commands deploy.
 * @returns the module, its declaration and catalog included.
 */
export function createDemoModule(params: { guildIds: readonly string[] }): BotModule {
	return {
		name: "demo",
		label: DEMO_MESSAGES.moduleName,
		build(context) {
			const deps = { ...context, guildIds: params.guildIds };
			return { commands: [createConfigCommand(deps), createDemoLogCommand(deps)] };
		},
		translations: DEMO_CATALOG,
		settings: [demoSettings],
	};
}
