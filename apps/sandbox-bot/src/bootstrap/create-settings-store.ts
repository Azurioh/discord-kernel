import type { SettingsStore } from "@azurioh/discord-kernel/settings";
import type { SettingsStoreConfig } from "@/config";
import { createJsonFileSettingsStore } from "@/shared/settings/json-file-settings-store";
import { createSqliteSettingsStore } from "@/shared/settings/sqlite/sqlite-settings-store";

/**
 * Build the settings adapter the configuration names. The only place that
 * knows the adapters: everything else sees the `SettingsStore` port.
 *
 * @param config - the adapter and its file.
 * @returns the store.
 */
export function createSettingsStore(config: SettingsStoreConfig): SettingsStore {
	switch (config.adapter) {
		case "json":
			return createJsonFileSettingsStore(config.file);
		case "sqlite":
			return createSqliteSettingsStore(config.file);
		default:
			return config.adapter satisfies never;
	}
}
