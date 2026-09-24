import { createSandbox } from "@/bootstrap/create-sandbox";
import { reportStartupFailure } from "@/bootstrap/report-startup-failure";
import { loadConfig } from "@/config";
import { createPinoLogger } from "@/shared/logging/pino-logger";

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

const logger = createPinoLogger("sandbox-bot");

/** Wire the sandbox, close the gateway session on a shutdown signal, then log in. */
async function start(): Promise<void> {
	const config = loadConfig();
	const { client } = createSandbox(config, logger);
	for (const signal of SHUTDOWN_SIGNALS) {
		process.once(signal, () => {
			logger.info({ signal }, "Shutting down");
			void client.destroy();
		});
	}
	await client.login(config.token);
}

start().catch((error: unknown) => reportStartupFailure(logger, error));
