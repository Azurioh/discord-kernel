import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import type { Logger } from "@azurioh/discord-kernel/logger";
import type { BotModule } from "@azurioh/discord-kernel/module/module";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { createConfigCommand } from "@/modules/demo/commands/config/config.command";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo.catalog";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { demoSettings } from "@/modules/demo/settings/demo.settings";

export interface DemoModuleDeps {
	readonly guildIds: readonly string[];
	/**
	 * Resolves the settings service once the composition root built it: the
	 * service's registry needs this module's declaration first.
	 */
	readonly settings: () => SettingsService;
	readonly translator: Translator;
	readonly logger: Logger;
}

/**
 * Declares settings of most kinds and serves them through `/config`.
 *
 * @param deps - where the commands deploy, the settings service and the translator.
 * @returns the module, its declaration and catalog included.
 */
export function createDemoModule(deps: DemoModuleDeps): BotModule {
	return {
		name: "demo",
		label: DEMO_MESSAGES.moduleName,
		commands: [createConfigCommand(deps)],
		translations: DEMO_CATALOG,
		settings: [demoSettings],
	};
}
