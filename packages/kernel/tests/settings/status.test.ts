import { describe, expect, it } from "vitest";
import { defineSettings } from "@/settings/define-settings";
import { field } from "@/settings/fields/builders";
import type { StoredSettings } from "@/settings/ports/settings-store";
import { createReadOnlySettingsService } from "./fixtures/read-only-settings-service";
import { sampleSettings } from "./fixtures/sample-declaration";

const GUILD_A = "100000000000000001";
const GUILD_B = "100000000000000002";
const CHANNEL = "200000000000000001";

function record(guildId: string, values: Record<string, unknown>): StoredSettings {
	return {
		guildId,
		moduleId: sampleSettings.id,
		version: 1,
		revision: 1,
		values,
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("SettingsService.status", () => {
	it("lists every required field without default a guild left unset, in declared order", async () => {
		const { service } = await createReadOnlySettingsService();

		await expect(service.status(sampleSettings, GUILD_A)).resolves.toStrictEqual({
			missing: ["logChannel", "keywords"],
		});
	});

	it("is empty once every required field is set", async () => {
		const { service } = await createReadOnlySettingsService([
			record(GUILD_A, { logChannel: CHANNEL, keywords: ["help"] }),
		]);

		await expect(service.status(sampleSettings, GUILD_A)).resolves.toStrictEqual({ missing: [] });
	});

	it("reports each guild on its own", async () => {
		const { service } = await createReadOnlySettingsService([
			record(GUILD_A, { logChannel: CHANNEL }),
		]);

		await expect(service.status(sampleSettings, GUILD_A)).resolves.toStrictEqual({
			missing: ["keywords"],
		});
		await expect(service.status(sampleSettings, GUILD_B)).resolves.toStrictEqual({
			missing: ["logChannel", "keywords"],
		});
	});

	it("never lists a required field with a default, nor an optional one", async () => {
		const declaration = defineSettings({
			id: "defaulted",
			version: 1,
			labels: { title: "defaulted.title" },
			fields: {
				limit: field.integer({ label: "defaulted.limit", required: true, default: 3 }),
				note: field.text({ label: "defaulted.note" }),
			},
		});
		const { service } = await createReadOnlySettingsService();

		await expect(service.status(declaration, GUILD_A)).resolves.toStrictEqual({ missing: [] });
	});

	it("counts a stored value that fails validation as unset", async () => {
		const { service } = await createReadOnlySettingsService([
			record(GUILD_A, { logChannel: 42, keywords: ["help"] }),
		]);

		await expect(service.status(sampleSettings, GUILD_A)).resolves.toStrictEqual({
			missing: ["logChannel"],
		});
	});

	it("reads through the service's cache, and sees a change as soon as it is notified", async () => {
		const { service, read, store, notifier } = await createReadOnlySettingsService();

		await service.status(sampleSettings, GUILD_A);
		await service.get(sampleSettings, GUILD_A);
		await service.status(sampleSettings, GUILD_A);
		expect(read).toHaveBeenCalledTimes(1);

		await store.write(record(GUILD_A, { logChannel: CHANNEL, keywords: ["help"] }), {
			expectedRevision: null,
		});
		notifier.notify({
			guildId: GUILD_A,
			moduleId: sampleSettings.id,
			changedKeys: ["logChannel", "keywords"],
			revision: 1,
			changedBy: "user",
		});

		await expect(service.status(sampleSettings, GUILD_A)).resolves.toStrictEqual({ missing: [] });
	});
});
