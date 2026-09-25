import { createCommand } from "@azurioh/discord-kernel/discord/command/create-command";
import type { Guard } from "@azurioh/discord-kernel/discord/command/guard";
import type { SlashCommand } from "@azurioh/discord-kernel/discord/command/types";
import { requireConfigured } from "@azurioh/discord-kernel/discord/settings/require-configured";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { createDemoLogHandler } from "@/modules/demo/commands/demo-log/demo-log.handler";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo.catalog";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { demoSettings } from "@/modules/demo/settings/demo.settings";
import { localizedDescription } from "@/shared/discord/localized-description";

export interface DemoLogCommandDeps {
	readonly guildIds: readonly string[];
	/** Resolved on each use: the service is built after the modules declared their settings. */
	readonly settings: () => SettingsService;
}

/**
 * `/demo-log`: open to every member, and blocked by `requireConfigured` until
 * the demo's required log channel is set. Members with Manage Server also
 * read which setting is missing.
 */
export function createDemoLogCommand(deps: DemoLogCommandDeps): SlashCommand {
	// Built on use, like the handler: the service does not exist yet here.
	const configured: Guard = {
		check: (interaction, runtime) =>
			requireConfigured(demoSettings, deps.settings()).check(interaction, runtime),
	};
	return createCommand({
		name: "demo-log",
		...localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.demoLogDescription),
		guildIds: deps.guildIds,
		guildOnly: true,
		guard: configured,
		handler: createDemoLogHandler(deps.settings),
	});
}
