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
	} catch (error) {
		reportStartupFailure(logger, error);
	}
}

await start();
