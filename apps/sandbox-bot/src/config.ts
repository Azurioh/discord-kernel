import { fileURLToPath } from "node:url";
import { enumEnv, optionalEnv, requireEnv } from "@azurioh/discord-kernel/config/env";

/** The `SettingsStore` adapters the sandbox can boot with, picked by `SETTINGS_STORE`. */
const SETTINGS_STORE_ADAPTERS = ["json", "sqlite"] as const;

/** Where settings live when no path is set: `.data/` in this app, gitignored. */
const DEFAULT_SETTINGS_FILES = {
	json: fileURLToPath(new URL("../.data/settings.json", import.meta.url)),
	sqlite: fileURLToPath(new URL("../.data/settings.sqlite", import.meta.url)),
} as const;

/** The variable that overrides each adapter's file. */
const SETTINGS_FILE_VARIABLES = {
	json: "SETTINGS_FILE",
	sqlite: "SETTINGS_SQLITE_FILE",
} as const;

/** Which adapter persists settings, and the file it works on. */
export interface SettingsStoreConfig {
	readonly adapter: (typeof SETTINGS_STORE_ADAPTERS)[number];
	readonly file: string;
}

export interface SandboxConfig {
	readonly token: string;
	readonly clientId: string;
	/** Every command is registered to this guild only, so updates are instant. */
	readonly devGuildId: string;
	readonly settingsStore: SettingsStoreConfig;
}

/**
 * Read the sandbox configuration from the environment.
 *
 * @throws MissingEnvError when a required variable is missing or empty.
 * @throws InvalidEnvError when `SETTINGS_STORE` names no known adapter.
 */
export function loadConfig(): SandboxConfig {
	const adapter = enumEnv("SETTINGS_STORE", SETTINGS_STORE_ADAPTERS, "json");
	return {
		token: requireEnv("DISCORD_TOKEN_DEV"),
		clientId: requireEnv("DISCORD_CLIENT_ID_DEV"),
		devGuildId: requireEnv("DISCORD_GUILD_ID_DEV"),
		settingsStore: {
			adapter,
			file: optionalEnv(SETTINGS_FILE_VARIABLES[adapter]) ?? DEFAULT_SETTINGS_FILES[adapter],
		},
	};
}
