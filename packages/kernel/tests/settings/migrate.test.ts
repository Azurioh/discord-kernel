import { describe, expect, it, vi } from "vitest";
import { ConflictError } from "@/errors/business-error";
import { defineSettings, type SettingsMigration } from "@/settings/define-settings";
import { field } from "@/settings/fields/builders";
import type { SettingsChangedEvent } from "@/settings/ports/settings-changed-notifier";
import type { StoredSettings } from "@/settings/ports/settings-store";
import { createReadOnlySettingsService } from "./fixtures/read-only-settings-service";

const GUILD = "100000000000000001";
const USER = "400000000000000001";
const CTX = { guildId: GUILD, userId: USER, locale: "en" };
const MODULE = "warnings";

/**
 * Version 2 of a module whose version 1 stored `maxWarnings`: it renames the
 * field to `warnLimit` and adds `greeting`.
 */
function warningsV2(migrate: SettingsMigration) {
	return defineSettings({
		id: MODULE,
		version: 2,
		labels: { title: "warnings.title" },
		migrate,
		fields: {
			warnLimit: field.integer({ label: "warnings.limit", min: 1, max: 10, default: 3 }),
			mode: field.enum({
				label: "warnings.mode",
				choices: [
					{ value: "relaxed", label: "warnings.mode.relaxed" },
					{ value: "strict", label: "warnings.mode.strict" },
				],
				default: "relaxed",
			}),
			greeting: field.text({ label: "warnings.greeting", default: "hello" }),
		},
	});
}

/** The v1 → v2 migration: `maxWarnings` becomes `warnLimit`, the rest is kept. */
const renameMaxWarnings: SettingsMigration = (fromVersion, raw) => {
	if (fromVersion !== 1) {
		throw new Error(`no migration from version ${fromVersion}`);
	}
	const { maxWarnings, ...rest } = raw as Record<string, unknown>;
	return maxWarnings === undefined ? rest : { ...rest, warnLimit: maxWarnings };
};

function stored(values: Record<string, unknown>, overrides: Partial<StoredSettings> = {}) {
	return {
		guildId: GUILD,
		moduleId: MODULE,
		version: 1,
		revision: 4,
		values,
		updatedAt: "2026-01-01T00:00:00.000Z",
		updatedBy: USER,
		...overrides,
	} satisfies StoredSettings;
}

async function setup(records: readonly StoredSettings[], migrate = renameMaxWarnings) {
	const migration = vi.fn(migrate);
	const declaration = warningsV2(migration);
	const harness = await createReadOnlySettingsService(records);
	const events: SettingsChangedEvent[] = [];
	harness.notifier.subscribe((event) => events.push(event));
	const readStored = () => harness.store.read(GUILD, MODULE);
	return { ...harness, declaration, migration, events, readStored };
}

/** How many writes reached the store (a write rejected with a conflict did not). */
async function successfulWrites(write: { mock: { results: { value: unknown }[] } }) {
	const settled = await Promise.allSettled(write.mock.results.map((result) => result.value));
	return settled.filter((outcome) => outcome.status === "fulfilled").length;
}

describe("lazy settings migration", () => {
	it("reads a field the new version adds as its default (FR-016)", async () => {
		const { service, declaration } = await setup([stored({ mode: "strict" })]);

		const values = await service.get(declaration, GUILD);

		expect(values).toStrictEqual({ warnLimit: 3, mode: "strict", greeting: "hello" });
	});

	it("migrates, validates and writes the record once under the new version", async () => {
		const { service, declaration, migration, write, readStored } = await setup([
			stored({ maxWarnings: 7, mode: "strict" }),
		]);

		const values = await service.get(declaration, GUILD);

		expect(values).toStrictEqual({ warnLimit: 7, mode: "strict", greeting: "hello" });
		expect(migration).toHaveBeenCalledWith(1, { maxWarnings: 7, mode: "strict" });
		expect(write).toHaveBeenCalledTimes(1);
		expect(write.mock.calls[0]?.[1]).toStrictEqual({ expectedRevision: 4 });
		const record = await readStored();
		expect(record?.version).toBe(2);
		expect(record?.revision).toBe(5);
		expect(record?.values).toStrictEqual({ warnLimit: 7, mode: "strict" });
	});

	it("does not migrate again on the next read", async () => {
		const { service, declaration, migration, write } = await setup([stored({ maxWarnings: 7 })]);

		await service.get(declaration, GUILD);
		const again = await service.get(declaration, GUILD);

		expect(again.warnLimit).toBe(7);
		expect(migration).toHaveBeenCalledTimes(1);
		expect(write).toHaveBeenCalledTimes(1);
	});

	it("drops a key the migration returns that the declaration does not declare", async () => {
		const { service, declaration, readStored } = await setup([
			stored({ maxWarnings: 2, legacy: "x" }),
		]);

		await service.get(declaration, GUILD);

		expect((await readStored())?.values).toStrictEqual({ warnLimit: 2 });
	});

	it("tells listeners the record changed, so no cache keeps the unmigrated values", async () => {
		const { service, declaration, events } = await setup([stored({ maxWarnings: 7 })]);

		await service.get(declaration, GUILD);

		expect(events).toStrictEqual([
			{ guildId: GUILD, moduleId: MODULE, changedKeys: ["maxWarnings", "warnLimit"], revision: 5 },
		]);
	});

	it("serves the migrated values from the cache once migrated", async () => {
		const { service, declaration, read } = await setup([stored({ maxWarnings: 7 })]);

		await service.get(declaration, GUILD);
		await service.get(declaration, GUILD);
		read.mockClear();
		const cached = await service.get(declaration, GUILD);

		expect(cached.warnLimit).toBe(7);
		expect(read).not.toHaveBeenCalled();
	});

	it("reports the migrated values through getForSurface and status", async () => {
		const { service, declaration } = await setup([stored({ maxWarnings: 9 })]);

		expect((await service.getForSurface(declaration, GUILD)).warnLimit).toBe(9);
		expect(await service.status(declaration, GUILD)).toStrictEqual({ missing: [] });
	});

	describe("when the migration fails", () => {
		it("leaves the record unchanged, logs the error and reads what is still valid", async () => {
			const failing: SettingsMigration = () => {
				throw new Error("boom");
			};
			const original = stored({ maxWarnings: 7, mode: "strict" });
			const { service, declaration, write, logger, readStored } = await setup([original], failing);

			const values = await service.get(declaration, GUILD);

			expect(values).toStrictEqual({ warnLimit: 3, mode: "strict", greeting: "hello" });
			expect(write).not.toHaveBeenCalled();
			expect(await readStored()).toStrictEqual(original);
			expect(logger.error).toHaveBeenCalledWith(
				expect.objectContaining({
					guildId: GUILD,
					moduleId: MODULE,
					fromVersion: 1,
					toVersion: 2,
					err: "boom",
				}),
				expect.any(String),
			);
		});

		it("leaves the record unchanged when the result fails validation, reading defaults for the invalid fields", async () => {
			const original = stored({ maxWarnings: 50, mode: "strict" });
			const { service, declaration, write, logger, readStored } = await setup([original]);

			const values = await service.get(declaration, GUILD);

			expect(values).toStrictEqual({ warnLimit: 3, mode: "strict", greeting: "hello" });
			expect(write).not.toHaveBeenCalled();
			expect(await readStored()).toStrictEqual(original);
			expect(logger.error).toHaveBeenCalledWith(
				expect.objectContaining({
					guildId: GUILD,
					moduleId: MODULE,
					fromVersion: 1,
					toVersion: 2,
					keys: ["warnLimit"],
				}),
				expect.any(String),
			);
		});

		it("leaves the record unchanged when the migration returns no object", async () => {
			const original = stored({ mode: "strict" });
			const { service, declaration, write, logger } = await setup([original], () => "nope");

			const values = await service.get(declaration, GUILD);

			expect(values.mode).toBe("strict");
			expect(write).not.toHaveBeenCalled();
			expect(logger.error).toHaveBeenCalledOnce();
		});
	});

	it("never writes a record of a newer version, reading defaults for what does not validate (FR-019)", async () => {
		const newer = stored({ warnLimit: 99, mode: "strict", added: true }, { version: 3 });
		const { service, declaration, migration, write, readStored } = await setup([newer]);

		const values = await service.get(declaration, GUILD);

		expect(values).toStrictEqual({ warnLimit: 3, mode: "strict", greeting: "hello" });
		expect(migration).not.toHaveBeenCalled();
		expect(write).not.toHaveBeenCalled();
		expect(await readStored()).toStrictEqual(newer);
	});

	it("ignores a stored field the declaration does not declare (FR-017)", async () => {
		const current = stored({ mode: "strict", removed: "old" }, { version: 2 });
		const { service, declaration, write } = await setup([current]);

		const values = await service.get(declaration, GUILD);

		expect(values).toStrictEqual({ warnLimit: 3, mode: "strict", greeting: "hello" });
		expect(write).not.toHaveBeenCalled();
	});

	describe("concurrent reads of one unmigrated record", () => {
		it("writes the migration once; the read that loses the race returns the migrated values", async () => {
			const { service, declaration, write, readStored, logger } = await setup([
				stored({ maxWarnings: 7 }),
			]);

			const [first, second] = await Promise.all([
				service.get(declaration, GUILD),
				service.get(declaration, GUILD),
			]);

			expect(first.warnLimit).toBe(7);
			expect(second.warnLimit).toBe(7);
			expect(write).toHaveBeenCalledTimes(2);
			for (const call of write.mock.calls) {
				expect(call[1]).toStrictEqual({ expectedRevision: 4 });
			}
			await expect(Promise.all(write.mock.results.map((r) => r.value))).rejects.toBeInstanceOf(
				ConflictError,
			);
			expect(await successfulWrites(write)).toBe(1);
			const record = await readStored();
			expect(record?.version).toBe(2);
			expect(record?.revision).toBe(5);
			expect(logger.error).not.toHaveBeenCalled();
		});
	});

	describe("writes on a record of an older version", () => {
		it("set migrates first, then merges the patch onto the migrated values", async () => {
			const { service, declaration, readStored } = await setup([
				stored({ maxWarnings: 7, mode: "relaxed" }),
			]);

			const written = await service.set(declaration, GUILD, { mode: "strict" }, CTX);

			expect(written.version).toBe(2);
			expect(written.values).toStrictEqual({ warnLimit: 7, mode: "strict" });
			expect((await readStored())?.values).toStrictEqual({ warnLimit: 7, mode: "strict" });
		});

		it("reset migrates first, then unsets the keys of the migrated values", async () => {
			const { service, declaration, readStored } = await setup([
				stored({ maxWarnings: 7, mode: "strict" }),
			]);

			await service.reset(declaration, GUILD, ["mode"], CTX);

			const record = await readStored();
			expect(record?.version).toBe(2);
			expect(record?.values).toStrictEqual({ warnLimit: 7 });
		});

		it("set after a failed migration merges onto the values the guild reads", async () => {
			const { service, declaration, readStored } = await setup([
				stored({ maxWarnings: 50, mode: "strict" }),
			]);

			await service.set(declaration, GUILD, { greeting: "hi" }, CTX);

			const record = await readStored();
			expect(record?.version).toBe(2);
			expect(record?.values).toStrictEqual({ mode: "strict", greeting: "hi" });
		});
	});
});
