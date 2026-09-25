import { describe, expect, it } from "vitest";
import type { StoredSettings } from "@/settings/ports/settings-store";
import { createReadOnlySettingsService } from "./fixtures/read-only-settings-service";
import { sampleSettings } from "./fixtures/sample-declaration";

const GUILD_A = "100000000000000001";
const GUILD_B = "100000000000000002";
const CHANNEL = "200000000000000001";
const ROLE = "300000000000000001";

/** What `get` returns for a guild that never stored anything. */
const SAMPLE_DEFAULTS = {
	logChannel: undefined,
	staffRole: undefined,
	owner: undefined,
	accent: "#5865f2",
	cooldown: 900,
	region: "eu",
	maxOpen: 1,
	ratio: undefined,
	greeting: undefined,
	enabled: true,
	apiKey: undefined,
	watchedChannels: [],
	pingRoles: undefined,
	notifyUsers: undefined,
	tiers: undefined,
	thresholds: undefined,
	keywords: undefined,
	features: { tickets: true, logs: false },
};

function record(guildId: string, values: Record<string, unknown>): StoredSettings {
	return {
		guildId,
		moduleId: sampleSettings.id,
		version: sampleSettings.version,
		revision: 1,
		values,
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("SettingsService.get", () => {
	it("returns every default for an unconfigured guild and writes nothing", async () => {
		const { service, write } = await createReadOnlySettingsService();

		const values = await service.get(sampleSettings, GUILD_A);

		expect(values).toStrictEqual(SAMPLE_DEFAULTS);
		expect(write).not.toHaveBeenCalled();
	});

	it("returns stored values over defaults", async () => {
		const { service, write } = await createReadOnlySettingsService([
			record(GUILD_A, {
				logChannel: CHANNEL,
				cooldown: 120,
				region: "na",
				pingRoles: [ROLE],
				keywords: ["help"],
			}),
		]);

		const values = await service.get(sampleSettings, GUILD_A);

		expect(values).toStrictEqual({
			...SAMPLE_DEFAULTS,
			logChannel: CHANNEL,
			cooldown: 120,
			region: "na",
			pingRoles: [ROLE],
			keywords: ["help"],
		});
		expect(write).not.toHaveBeenCalled();
	});

	it("never returns one guild's values for another guild", async () => {
		const { service } = await createReadOnlySettingsService([
			record(GUILD_A, { logChannel: CHANNEL, maxOpen: 4 }),
		]);

		const values = await service.get(sampleSettings, GUILD_B);

		expect(values).toStrictEqual(SAMPLE_DEFAULTS);
	});

	it("gives module logic the value of a secret", async () => {
		const { service } = await createReadOnlySettingsService([
			record(GUILD_A, { apiKey: "s3cr3t" }),
		]);

		const values = await service.get(sampleSettings, GUILD_A);

		expect(values.apiKey).toBe("s3cr3t");
	});

	it("ignores stored keys the declaration does not declare", async () => {
		const { service } = await createReadOnlySettingsService([
			record(GUILD_A, { removed: "old", maxOpen: 3 }),
		]);

		const values = await service.get(sampleSettings, GUILD_A);

		expect(values).toStrictEqual({ ...SAMPLE_DEFAULTS, maxOpen: 3 });
	});

	it("reads a toggle missing from storage as its per-key default, else false", async () => {
		const { service } = await createReadOnlySettingsService([
			record(GUILD_A, { features: { logs: true } }),
		]);

		const values = await service.get(sampleSettings, GUILD_A);

		expect(values.features).toStrictEqual({ tickets: true, logs: true });
	});

	it("ignores a stored toggle the declaration no longer declares, without logging (FR-017)", async () => {
		const { service, write, logger } = await createReadOnlySettingsService([
			record(GUILD_A, { features: { logs: true, removed: true } }),
		]);

		const values = await service.get(sampleSettings, GUILD_A);

		expect(values.features).toStrictEqual({ tickets: true, logs: true });
		expect(write).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("falls back to the default of a stored value that no longer validates, and logs it as an error", async () => {
		const { service, write, logger } = await createReadOnlySettingsService([
			record(GUILD_A, { maxOpen: 99, greeting: 42, region: "na" }),
		]);

		const values = await service.get(sampleSettings, GUILD_A);

		expect(values).toStrictEqual({ ...SAMPLE_DEFAULTS, region: "na" });
		expect(write).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				guildId: GUILD_A,
				moduleId: sampleSettings.id,
				keys: ["maxOpen", "greeting"],
			}),
			expect.any(String),
		);
	});
});
