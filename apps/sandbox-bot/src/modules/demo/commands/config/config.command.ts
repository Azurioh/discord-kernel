import { createCommand } from "@azurioh/discord-kernel/discord/command/create-command";
import { allOf } from "@azurioh/discord-kernel/discord/command/guard";
import {
	createPermissionGuard,
	guildOnlyGuard,
} from "@azurioh/discord-kernel/discord/command/permission-guard";
import type { SlashCommand } from "@azurioh/discord-kernel/discord/command/types";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { PermissionFlagsBits } from "discord.js";
import { createResetSubcommand } from "@/modules/demo/commands/config/reset/reset.definition";
import { createSetSubcommand } from "@/modules/demo/commands/config/set/set.definition";
import { createShowSubcommand } from "@/modules/demo/commands/config/show/show.definition";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo.catalog";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { localizedDescription } from "@/shared/discord/localized-description";

export interface ConfigCommandDeps {
	readonly guildIds: readonly string[];
	/** Resolved on each use: the service is built after the modules declared their settings. */
	readonly settings: () => SettingsService;
	readonly translator: Translator;
}

/**
 * `/config show|set|reset` over the demo module's settings: a text surface on
 * the settings service, gated to members who can manage the server. Each
 * subcommand lives in its own folder; this file only assembles them.
 */
export function createConfigCommand(deps: ConfigCommandDeps): SlashCommand {
	return createCommand({
		name: "config",
		...localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.configDescription),
		guildIds: deps.guildIds,
		guildOnly: true,
		defaultMemberPermissions: [PermissionFlagsBits.ManageGuild],
		guard: allOf(guildOnlyGuard, createPermissionGuard([PermissionFlagsBits.ManageGuild])),
		subcommands: {
			show: createShowSubcommand(deps.settings),
			set: createSetSubcommand(deps.settings, deps.translator),
			reset: createResetSubcommand(deps.settings, deps.translator),
		},
	});
}
