import { createSandbox } from "@/bootstrap/create-sandbox";
import { reportStartupFailure } from "@/bootstrap/report-startup-failure";
import { loadConfig } from "@/config";
import { createPinoLogger } from "@/shared/logging/pino-logger";

const logger = createPinoLogger("sandbox-bot");

/** Start through the kernel lifecycle; report startup failures after cleanup. */
async function start(): Promise<void> {
	try {
		const config = loadConfig();
		const bot = createSandbox(config, logger);
		await bot.start(config.token);
		// A stop requested during startup also resolves start(): only a running bot is ready.
		if (bot.state === "running") {
			logger.info(
				{ user: bot.client.user?.tag, guilds: bot.client.guilds.cache.size },
				"Sandbox bot is ready",
			);
		}
	} catch (error) {
		reportStartupFailure(logger, error);
	}
}

await start();
