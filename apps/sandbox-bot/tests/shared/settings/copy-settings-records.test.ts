import { createInMemorySettingsStore, type StoredSettings } from "@azurioh/discord-kernel/settings";
import { describe, expect, it } from "vitest";
import { copySettingsRecords } from "@/shared/settings/copy-settings-records";

const GUILD = "100000000000000001";

function record(overrides: Partial<StoredSettings> = {}): StoredSettings {
	return {
		guildId: GUILD,
		moduleId: "demo",
		version: 1,
		revision: 3,
		values: { accent: "#ff0000" },
		updatedAt: "2026-01-01T00:00:00.000Z",
		updatedBy: "200000000000000001",
		...overrides,
	};
}

describe("copySettingsRecords", () => {
	it("writes every record into the target as it was, revision included", async () => {
		const target = createInMemorySettingsStore();
		const records = [record(), record({ moduleId: "kernel", values: { locale: "fr" } })];

		const result = await copySettingsRecords({ records, target });

		expect(result).toEqual({ copied: 2, skipped: [] });
		expect(await target.read(GUILD, "demo")).toEqual(records[0]);
		expect(await target.read(GUILD, "kernel")).toEqual(records[1]);
	});

	it("never overwrites a record the target already holds, and reports it", async () => {
		const target = createInMemorySettingsStore();
		const existing = record({ revision: 9, values: { accent: "#00ff00" } });
		await target.write(existing, { expectedRevision: null });

		const result = await copySettingsRecords({ records: [record()], target });

		expect(result).toEqual({ copied: 0, skipped: [{ guildId: GUILD, moduleId: "demo" }] });
		expect(await target.read(GUILD, "demo")).toEqual(existing);
	});

	it("lets any other failure of the target through", async () => {
		const failure = new Error("disk full");
		const target = {
			...createInMemorySettingsStore(),
			write: async () => {
				throw failure;
			},
		};

		await expect(copySettingsRecords({ records: [record()], target })).rejects.toBe(failure);
	});
});
