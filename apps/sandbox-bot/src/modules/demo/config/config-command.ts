import {
	createCommand,
	createSubCommand,
} from "@azurioh/discord-kernel/discord/command/create-command";
import { allOf } from "@azurioh/discord-kernel/discord/command/guard";
import { createStringOption } from "@azurioh/discord-kernel/discord/command/options";
import {
	createPermissionGuard,
	guildOnlyGuard,
} from "@azurioh/discord-kernel/discord/command/permission-guard";
import type { SlashCommand } from "@azurioh/discord-kernel/discord/command/types";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { PermissionFlagsBits } from "discord.js";
import { createKeyAutocomplete } from "@/modules/demo/config/key-autocomplete";
import { createResetHandler } from "@/modules/demo/config/reset-handler";
import { createSetHandler } from "@/modules/demo/config/set-handler";
import { createShowHandler } from "@/modules/demo/config/show-handler";
import { DEMO_CATALOG, DEMO_MESSAGES } from "@/modules/demo/demo-catalog";
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
 * subcommand's handler lives in its own file; this one only declares and wires.
 */
export function createConfigCommand(deps: ConfigCommandDeps): SlashCommand {
	const show = createShowHandler(deps.settings);
	const set = createSetHandler(deps.settings);
	const reset = createResetHandler(deps.settings);

	const setKey = localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.setKeyDescription);
	const setValue = localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.setValueDescription);
	const resetKey = localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.resetKeyDescription);

	return createCommand({
		name: "config",
		...localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.configDescription),
		guildIds: deps.guildIds,
		guildOnly: true,
		defaultMemberPermissions: [PermissionFlagsBits.ManageGuild],
		guard: allOf(guildOnlyGuard, createPermissionGuard([PermissionFlagsBits.ManageGuild])),
		subcommands: {
			show: createSubCommand({
				...localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.showDescription),
				handler: show,
			}),
			set: createSubCommand({
				...localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.setDescription),
				options: {
					key: createStringOption(setKey.description, {}, setKey)
						.required()
						.withAutocomplete(createKeyAutocomplete(deps.translator, false)),
					value: createStringOption(setValue.description, {}, setValue).required(),
				},
				handler: (ctx) => set(ctx, ctx.options),
			}),
			reset: createSubCommand({
				...localizedDescription(DEMO_CATALOG, DEMO_MESSAGES.resetDescription),
				options: {
					key: createStringOption(resetKey.description, {}, resetKey)
						.required()
						.withAutocomplete(createKeyAutocomplete(deps.translator, true)),
				},
				handler: (ctx) => reset(ctx, ctx.options),
			}),
		},
	});
}
