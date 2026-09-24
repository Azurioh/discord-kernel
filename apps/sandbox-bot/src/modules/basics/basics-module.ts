import type { Logger } from "@azurioh/discord-kernel/logger";
import type { BotModule } from "@azurioh/discord-kernel/module/module";
import { BASICS_CATALOG } from "@/modules/basics/basics-catalog";
import { createLifecycleEvents } from "@/modules/basics/lifecycle-events";
import { createPagesCommand } from "@/modules/basics/pages-command";
import { createPingCommand } from "@/modules/basics/ping-command";
import { createRollCommand } from "@/modules/basics/roll-command";

export interface BasicsModuleDeps {
	readonly guildIds: readonly string[];
	readonly logger: Logger;
}

/** The command DSL, a guard, the paginator and gateway events, with no settings. */
export function createBasicsModule(deps: BasicsModuleDeps): BotModule {
	return {
		name: "basics",
		commands: [
			createPingCommand(deps.guildIds),
			createRollCommand(deps.guildIds),
			createPagesCommand(deps.guildIds, deps.logger),
		],
		events: createLifecycleEvents(deps.logger),
		translations: BASICS_CATALOG,
	};
}
