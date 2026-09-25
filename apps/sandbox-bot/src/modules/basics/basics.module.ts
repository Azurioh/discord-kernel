import type { Logger } from "@azurioh/discord-kernel/logger";
import type { BotModule } from "@azurioh/discord-kernel/module/module";
import { createPagesCommand } from "@/modules/basics/commands/pages/pages.command";
import { createPingCommand } from "@/modules/basics/commands/ping/ping.command";
import { createRollCommand } from "@/modules/basics/commands/roll/roll.command";
import { createGuildCreateEvent } from "@/modules/basics/events/lifecycle/guild-create/guild-create.event";
import { createReadyEvent } from "@/modules/basics/events/lifecycle/ready/ready.event";
import { BASICS_CATALOG } from "@/modules/basics/i18n/basics.catalog";
import { BASICS_MESSAGES } from "@/modules/basics/i18n/basics.messages";

export interface BasicsModuleDeps {
	readonly guildIds: readonly string[];
	readonly logger: Logger;
}

/** The command DSL, a guard, the paginator and gateway events, with no settings. */
export function createBasicsModule(deps: BasicsModuleDeps): BotModule {
	return {
		name: "basics",
		label: BASICS_MESSAGES.moduleName,
		commands: [
			createPingCommand(deps.guildIds),
			createRollCommand(deps.guildIds),
			createPagesCommand(deps.guildIds, deps.logger),
		],
		events: [createReadyEvent(deps.logger), createGuildCreateEvent(deps.logger)],
		translations: BASICS_CATALOG,
	};
}
