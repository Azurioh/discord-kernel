import type { BotModule } from "@azurioh/discord-kernel/module/module";
import { PAGINATOR_CATALOG } from "@/components/paginator/i18n/paginator.catalog";
import { createPagesCommand } from "@/modules/basics/commands/pages/pages.command";
import { createPingCommand } from "@/modules/basics/commands/ping/ping.command";
import { createRollCommand } from "@/modules/basics/commands/roll/roll.command";
import { createGuildCreateEvent } from "@/modules/basics/events/lifecycle/guild-create/guild-create.event";
import { BASICS_CATALOG } from "@/modules/basics/i18n/basics.catalog";
import { BASICS_MESSAGES } from "@/modules/basics/i18n/basics.messages";

/** The command DSL, a guard, the paginator and gateway events, with no settings.
 * @param params - The guilds where commands deploy.
 * @returns The basics module and its component catalogs.
 */
export function createBasicsModule(params: { guildIds: readonly string[] }): BotModule {
	return {
		name: "basics",
		label: BASICS_MESSAGES.moduleName,
		translations: { ...BASICS_CATALOG, ...PAGINATOR_CATALOG },
		build(context) {
			return {
				setup() {
					context.logger.info(
						{ user: context.client.user?.tag, guilds: context.client.guilds.cache.size },
						"Sandbox bot is ready",
					);
				},
				commands: [
					createPingCommand(params.guildIds),
					createRollCommand(params.guildIds),
					createPagesCommand(params.guildIds, context.logger),
				],
				events: [createGuildCreateEvent(context.logger)],
			};
		},
	};
}
