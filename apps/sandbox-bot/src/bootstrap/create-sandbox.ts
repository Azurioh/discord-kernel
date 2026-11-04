import { type Bot, createBot } from "@azurioh/discord-kernel/bot/create-bot";
import { createSettingsStore } from "@/bootstrap/create-settings-store";
import type { SandboxConfig } from "@/config";
import { createAdminModule } from "@/modules/admin/admin.module";
import { createBasicsModule } from "@/modules/basics/basics.module";
import { createDemoModule } from "@/modules/demo/demo.module";
import type { PinoLogger } from "@/shared/logging/pino-logger";
import { createLoggingSettingsNotifier } from "@/shared/settings/logging-settings-notifier";

/** Assemble the sandbox without connecting to Discord.
 * @param config - The environment-derived configuration.
 * @param logger - The application logger with its shutdown flush.
 * @returns A bot ready to start or deploy commands.
 * @throws ModuleRegistrationError for invalid module contributions.
 */
export function createSandbox(config: SandboxConfig, logger: PinoLogger): Bot {
	const guildIds = [config.devGuildId];
	return createBot({
		modules: [
			createAdminModule({ guildIds }),
			createBasicsModule({ guildIds }),
			createDemoModule({ guildIds }),
		],
		logger,
		settingsStore: createSettingsStore(config.settingsStore),
		adapters: { notifier: createLoggingSettingsNotifier(logger) },
		lifecycle: { flushes: [{ name: "pino", flush: () => logger.flush() }] },
	});
}
