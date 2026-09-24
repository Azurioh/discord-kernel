import { createSandbox } from "@/bootstrap/create-sandbox";
import { reportStartupFailure } from "@/bootstrap/report-startup-failure";
import { loadConfig } from "@/config";
import { createPinoLogger } from "@/shared/logging/pino-logger";

const logger = createPinoLogger("sandbox-bot");

/**
 * Push every command to the dev guild. Global commands are synced to none,
 * which also prunes any left over from an earlier registration.
 */
async function register(): Promise<void> {
	const config = loadConfig();
	const { commands } = createSandbox(config, logger);
	const count = await commands.deployCommands(config.token, config.clientId);
	logger.info({ count, guildId: config.devGuildId }, "Commands registered");
}

register().catch((error: unknown) => reportStartupFailure(logger, error));
