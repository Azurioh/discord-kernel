import type { Client } from "discord.js";
import type { Clock } from "@/clock";
import type { Presenter } from "@/discord/presenter";
import type { Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";
import type { SettingsRegistry } from "@/settings/registry";
import type { SettingsService } from "@/settings/settings-service";
import type { ModuleGate } from "@/settings/system/module-gate";

/** Finished kernel services shared by the bot and its modules. */
export interface BotServices {
	readonly client: Client;
	readonly logger: Logger;
	readonly translator: Translator;
	readonly registry: SettingsRegistry;
	readonly settings: SettingsService;
	readonly gate: ModuleGate;
	readonly presenter: Presenter;
	readonly clock: Clock;
}

/** Services passed to build, with the logger bound to the module's name. */
export type ModuleContext = BotServices;
