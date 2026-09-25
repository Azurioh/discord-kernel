import { InvalidEnvError } from "@azurioh/discord-kernel/config/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "@/config";

beforeEach(() => {
	vi.stubEnv("DISCORD_TOKEN_DEV", "token");
	vi.stubEnv("DISCORD_CLIENT_ID_DEV", "client");
	vi.stubEnv("DISCORD_GUILD_ID_DEV", "guild");
	vi.stubEnv("SETTINGS_STORE", "");
	vi.stubEnv("SETTINGS_FILE", "");
	vi.stubEnv("SETTINGS_SQLITE_FILE", "");
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("loadConfig", () => {
	it("stores settings in the default JSON file when nothing is set", () => {
		expect(loadConfig().settingsStore).toEqual({
			adapter: "json",
			file: expect.stringMatching(/\.data\/settings\.json$/),
		});
	});

	it("reads the JSON file from SETTINGS_FILE", () => {
		vi.stubEnv("SETTINGS_FILE", "/tmp/custom.json");

		expect(loadConfig().settingsStore).toEqual({ adapter: "json", file: "/tmp/custom.json" });
	});

	it("stores settings in the default SQLite file when SETTINGS_STORE is sqlite", () => {
		vi.stubEnv("SETTINGS_STORE", "sqlite");

		expect(loadConfig().settingsStore).toEqual({
			adapter: "sqlite",
			file: expect.stringMatching(/\.data\/settings\.sqlite$/),
		});
	});

	it("reads the SQLite file from SETTINGS_SQLITE_FILE", () => {
		vi.stubEnv("SETTINGS_STORE", "sqlite");
		vi.stubEnv("SETTINGS_SQLITE_FILE", "/tmp/custom.sqlite");

		expect(loadConfig().settingsStore).toEqual({ adapter: "sqlite", file: "/tmp/custom.sqlite" });
	});

	it("refuses an unknown adapter", () => {
		vi.stubEnv("SETTINGS_STORE", "postgres");

		expect(() => loadConfig()).toThrow(InvalidEnvError);
	});
});
