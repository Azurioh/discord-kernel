import { reportStartupFailure } from "@/bootstrap/report-startup-failure";
import { loadSettingsCopyConfig } from "@/config";
import { createPinoLogger } from "@/shared/logging/pino-logger";
import { copySettingsRecords } from "@/shared/settings/copy-settings-records";
import { loadRecords } from "@/shared/settings/settings-records-file";
import { createSqliteSettingsStore } from "@/shared/settings/sqlite/sqlite-settings-store";

const logger = createPinoLogger("sandbox-bot");

/**
 * Copy the JSON store's records into the SQLite store, so switching
 * `SETTINGS_STORE` to `sqlite` keeps every guild's settings. Records the
 * SQLite store already holds are left as they are.
 */
async function copyJsonToSqlite(): Promise<void> {
	const { json, sqlite } = loadSettingsCopyConfig();
	const records = Object.values(await loadRecords(json));
	const result = await copySettingsRecords({
		records,
		target: createSqliteSettingsStore(sqlite),
	});
	logger.info({ from: json, to: sqlite, ...result }, "Settings copied");
}

copyJsonToSqlite().catch((error: unknown) => reportStartupFailure(logger, error));
