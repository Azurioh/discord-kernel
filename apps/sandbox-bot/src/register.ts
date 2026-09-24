import { createSandbox } from "@/bootstrap/create-sandbox";
import { reportStartupFailure } from "@/bootstrap/report-startup-failure";
import { loadConfig } from "@/config";

/**
 * Push every command to the dev guild. Global commands are synced to none,
 * which also prunes any left over from an earlier registration.
 */
async function register(): Promise<void> {
	const config = loadConfig();
	const { commands, logger } = createSandbox(config);
	const count = await commands.deployCommands(config.token, config.clientId);
	logger.info({ count, guildId: config.devGuildId }, "Commands registered");
}

register().catch(reportStartupFailure);
