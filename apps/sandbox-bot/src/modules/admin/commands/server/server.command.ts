import { createCommand } from "@azurioh/discord-kernel/discord/command/create-command";
import { allOf } from "@azurioh/discord-kernel/discord/command/guard";
import {
	createPermissionGuard,
	guildOnlyGuard,
} from "@azurioh/discord-kernel/discord/command/permission-guard";
import type { SlashCommand } from "@azurioh/discord-kernel/discord/command/types";
import { PermissionFlagsBits } from "discord.js";
import {
	createServerHandler,
	type ServerHandlerDeps,
} from "@/modules/admin/commands/server/server.handler";
import { ADMIN_CATALOG } from "@/modules/admin/i18n/admin.catalog";
import { ADMIN_MESSAGES } from "@/modules/admin/i18n/admin.messages";
import { localizedDescription } from "@/shared/discord/localized-description";

export interface ServerCommandDeps extends ServerHandlerDeps {
	readonly guildIds: readonly string[];
}

/**
 * `/server`: the guild's kernel settings (enabled modules, bot language),
 * for members who can manage the server. Deferred while the values load.
 */
export function createServerCommand(deps: ServerCommandDeps): SlashCommand {
	return createCommand({
		name: "server",
		...localizedDescription(ADMIN_CATALOG, ADMIN_MESSAGES.serverDescription),
		guildIds: deps.guildIds,
		guildOnly: true,
		defaultMemberPermissions: [PermissionFlagsBits.ManageGuild],
		guard: allOf(guildOnlyGuard, createPermissionGuard([PermissionFlagsBits.ManageGuild])),
		defer: true,
		handler: createServerHandler(deps),
	});
}
