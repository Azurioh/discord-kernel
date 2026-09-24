import { fileURLToPath } from "node:url";
import { optionalEnv, requireEnv } from "@azurioh/discord-kernel/config/env";

/** Where settings live when `SETTINGS_FILE` is not set: `.data/` in this app, gitignored. */
const DEFAULT_SETTINGS_FILE = fileURLToPath(new URL("../.data/settings.json", import.meta.url));

export interface SandboxConfig {
	readonly token: string;
	readonly clientId: string;
	/** Every command is registered to this guild only, so updates are instant. */
	readonly devGuildId: string;
	readonly settingsFile: string;
}

/**
 * Read the sandbox configuration from the environment.
 *
 * @throws MissingEnvError when a required variable is missing or empty.
 */
export function loadConfig(): SandboxConfig {
	return {
		token: requireEnv("DISCORD_TOKEN"),
		clientId: requireEnv("DISCORD_CLIENT_ID"),
		devGuildId: requireEnv("DISCORD_DEV_GUILD_ID"),
		settingsFile: optionalEnv("SETTINGS_FILE") ?? DEFAULT_SETTINGS_FILE,
	};
}
