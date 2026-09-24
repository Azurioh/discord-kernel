import {
	createCommand,
	createSubCommand,
} from "@azurioh/discord-kernel/discord/command/create-command";
import { allOf } from "@azurioh/discord-kernel/discord/command/guard";
import { frenchLocalization } from "@azurioh/discord-kernel/discord/command/localization";
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

	return createCommand({
		name: "config",
		description: "Read and change the demo settings",
		descriptionLocalizations: frenchLocalization("Lire et modifier les paramètres de la démo"),
		guildIds: deps.guildIds,
		guildOnly: true,
		defaultMemberPermissions: [PermissionFlagsBits.ManageGuild],
		guard: allOf(guildOnlyGuard, createPermissionGuard([PermissionFlagsBits.ManageGuild])),
		subcommands: {
			show: createSubCommand({
				description: "Show every demo setting",
				descriptionLocalizations: frenchLocalization("Afficher tous les paramètres de la démo"),
				handler: show,
			}),
			set: createSubCommand({
				description: "Change one demo setting",
				descriptionLocalizations: frenchLocalization("Modifier un paramètre de la démo"),
				options: {
					key: createStringOption(
						"The setting to change",
						{},
						{ descriptionLocalizations: frenchLocalization("Le paramètre à modifier") },
					)
						.required()
						.withAutocomplete(createKeyAutocomplete(deps.translator, false)),
					value: createStringOption(
						"The new value: JSON, or plain text",
						{},
						{
							descriptionLocalizations: frenchLocalization(
								"La nouvelle valeur : du JSON, ou du texte brut",
							),
						},
					).required(),
				},
				handler: (ctx) => set(ctx, ctx.options),
			}),
			reset: createSubCommand({
				description: "Put one demo setting, or all of them, back to the default",
				descriptionLocalizations: frenchLocalization(
					"Remettre un paramètre de la démo, ou tous, à la valeur par défaut",
				),
				options: {
					key: createStringOption(
						"The setting to reset, or all",
						{},
						{
							descriptionLocalizations: frenchLocalization("Le paramètre à réinitialiser, ou tous"),
						},
					)
						.required()
						.withAutocomplete(createKeyAutocomplete(deps.translator, true)),
				},
				handler: (ctx) => reset(ctx, ctx.options),
			}),
		},
	});
}
