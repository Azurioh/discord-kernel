import { describe, expect, expectTypeOf, it } from "vitest";
import type { StoredSettings } from "@/settings/ports/settings-store";
import type { SecretState, SurfaceValues } from "@/settings/types";
import { createReadOnlySettingsService } from "./fixtures/read-only-settings-service";
import { sampleSettings } from "./fixtures/sample-declaration";

const GUILD = "100000000000000001";
const SECRET = "s3cr3t";

function record(values: Record<string, unknown>): StoredSettings {
	return {
		guildId: GUILD,
		moduleId: sampleSettings.id,
		version: sampleSettings.version,
		revision: 1,
		values,
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("SettingsService.getForSurface", () => {
	it("reports a set secret as set, never its value", async () => {
		const { service } = await createReadOnlySettingsService([
			record({ apiKey: SECRET, maxOpen: 3 }),
		]);

		const values = await service.getForSurface(sampleSettings, GUILD);

		expect(values.apiKey).toStrictEqual({ isSet: true });
		expect(JSON.stringify(values)).not.toContain(SECRET);
		expect(values.maxOpen).toBe(3);
	});

	it("reports an unset secret as not set", async () => {
		const { service } = await createReadOnlySettingsService();

		const values = await service.getForSurface(sampleSettings, GUILD);

		expect(values.apiKey).toStrictEqual({ isSet: false });
	});

	it("returns every other field as module logic reads it, and writes nothing", async () => {
		const { service, write } = await createReadOnlySettingsService([
			record({ apiKey: SECRET, region: "na" }),
		]);

		const surface = await service.getForSurface(sampleSettings, GUILD);
		const { apiKey: _secret, ...logic } = await service.get(sampleSettings, GUILD);

		expect(surface).toStrictEqual({ ...logic, apiKey: { isSet: true } });
		expect(write).not.toHaveBeenCalled();
	});

	it("is typed with secrets as their state", async () => {
		const { service } = await createReadOnlySettingsService();

		const values = await service.getForSurface(sampleSettings, GUILD);

		expectTypeOf(values).toEqualTypeOf<SurfaceValues<typeof sampleSettings>>();
		expectTypeOf(values.apiKey).toEqualTypeOf<SecretState>();
	});
});
