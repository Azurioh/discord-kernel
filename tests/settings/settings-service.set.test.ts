import { describe, expect, it, vi } from "vitest";
import { fixedClock } from "@/clock";
import { ConflictError, ValidationError } from "@/errors/business-error";
import type { Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import { SETTINGS_ISSUE_MESSAGES } from "@/settings/messages";
import type { SettingsChangedEvent } from "@/settings/ports/settings-changed-notifier";
import type { SettingsStore, StoredSettings } from "@/settings/ports/settings-store";
import type { SettingsRegistry } from "@/settings/registry";
import { createSettingsService } from "@/settings/settings-service";
import { SettingsValidationError } from "@/settings/settings-validation-error";
import {
	ROLE_A,
	TEXT_CHANNEL,
	VALUE_CASES,
	VALUE_CASES_DIRECTORY_SEED,
	VALUE_CASES_GUILD,
	valueCasesSettings,
} from "./fixtures/value-cases";

const GUILD = VALUE_CASES_GUILD;
const OTHER_GUILD = "100000000000000002";
const USER = "400000000000000001";
const NOW = "2026-03-04T05:06:07.000Z";
const CTX = { guildId: GUILD, userId: USER, locale: "en" };

function makeLogger(): Logger {
	const logger = {
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
		child: () => logger,
	};
	return logger as unknown as Logger;
}

function record(values: Record<string, unknown>, overrides: Partial<StoredSettings> = {}) {
	return {
		guildId: GUILD,
		moduleId: valueCasesSettings.id,
		version: valueCasesSettings.version,
		revision: 1,
		values,
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	} satisfies StoredSettings;
}

async function makeService(stored: readonly StoredSettings[] = []) {
	const store: SettingsStore = createInMemorySettingsStore();
	for (const entry of stored) {
		await store.write(entry, { expectedRevision: null });
	}
	const write = vi.spyOn(store, "write");
	const logger = makeLogger();
	const notifier = createInProcessNotifier(logger);
	const events: SettingsChangedEvent[] = [];
	notifier.subscribe((event) => events.push(event));
	const service = createSettingsService({
		// Writes never consult the registry: the declaration is passed in.
		registry: {} as SettingsRegistry,
		store,
		guilds: createInMemoryGuildDirectory(VALUE_CASES_DIRECTORY_SEED),
		notifier,
		translator: {} as Translator,
		clock: fixedClock(new Date(NOW)),
		logger,
	});
	return { service, store, write, events };
}

function readStored(store: SettingsStore) {
	return store.read(GUILD, valueCasesSettings.id);
}

describe("SettingsService.validate", () => {
	it("returns the stored form of a valid patch", async () => {
		const { service, write } = await makeService();

		const result = await service.validate(
			valueCasesSettings,
			GUILD,
			{ accent: "#FFF", cooldown: "1h" },
			CTX,
		);

		expect(result).toStrictEqual({ ok: true, values: { accent: "#ffffff", cooldown: 3600 } });
		expect(write).not.toHaveBeenCalled();
	});

	it("returns every issue of an invalid patch", async () => {
		const { service } = await makeService();

		const result = await service.validate(
			valueCasesSettings,
			GUILD,
			{ maxOpen: 9, removed: 1 },
			CTX,
		);

		expect(result).toStrictEqual({
			ok: false,
			issues: [
				{
					field: "maxOpen",
					code: "max",
					translation: { key: SETTINGS_ISSUE_MESSAGES.max, params: { max: 5 } },
				},
				{
					field: "removed",
					code: "unknownField",
					translation: { key: SETTINGS_ISSUE_MESSAGES.unknownField },
				},
			],
		});
	});

	it("throws on a patch that is not an object", async () => {
		const { service } = await makeService();

		const error = await service
			.validate(valueCasesSettings, GUILD, null, CTX)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ValidationError);
		expect(error).not.toBeInstanceOf(SettingsValidationError);
	});

	it("rejects a request context of another guild", async () => {
		const { service } = await makeService();

		await expect(
			service.validate(valueCasesSettings, GUILD, { maxOpen: 2 }, { ...CTX, guildId: OTHER_GUILD }),
		).rejects.toBeInstanceOf(ValidationError);
	});
});

describe("SettingsService.set", () => {
	describe("value table", () => {
		it.each(
			VALUE_CASES.map((valueCase) => ({
				...valueCase,
				title: `${valueCase.kind} ${valueCase.key} = ${JSON.stringify(valueCase.value)}`,
			})),
		)("$title", async ({ key, value, expected }) => {
			const { service, store } = await makeService();

			const outcome = service.set(valueCasesSettings, GUILD, { [key]: value }, CTX);

			if (expected.ok) {
				await outcome;
				const values = expected.stored === undefined ? {} : { [key]: expected.stored };
				expect((await readStored(store))?.values).toStrictEqual(values);
			} else {
				const error = await outcome.catch((caught: unknown) => caught);
				expect(error).toBeInstanceOf(SettingsValidationError);
				expect((error as SettingsValidationError).issues.map((issue) => issue.code)).toStrictEqual(
					expected.issues.map((issue) => issue.code),
				);
				expect(await readStored(store)).toBeNull();
			}
		});
	});

	it("throws on a patch that is not an object, and writes nothing", async () => {
		const { service, write } = await makeService();

		const error = await service
			.set(valueCasesSettings, GUILD, [TEXT_CHANNEL], CTX)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ValidationError);
		expect(error).not.toBeInstanceOf(SettingsValidationError);
		expect(write).not.toHaveBeenCalled();
	});

	it("writes the first record with revision 1, the declared version, the clock time and the author", async () => {
		const { service, store } = await makeService();

		const written = await service.set(valueCasesSettings, GUILD, { maxOpen: 3 }, CTX);

		const expected = {
			guildId: GUILD,
			moduleId: valueCasesSettings.id,
			version: valueCasesSettings.version,
			revision: 1,
			values: { maxOpen: 3 },
			updatedAt: NOW,
			updatedBy: USER,
		};
		expect(written).toStrictEqual(expected);
		expect(await readStored(store)).toStrictEqual(expected);
	});

	it("merges the patch onto the stored values and increments the revision", async () => {
		const { service, store } = await makeService([
			record({ maxOpen: 3, region: "na", staffRole: ROLE_A }),
		]);

		await service.set(valueCasesSettings, GUILD, { maxOpen: 4, staffRole: null }, CTX);

		const stored = await readStored(store);
		expect(stored?.values).toStrictEqual({ maxOpen: 4, region: "na" });
		expect(stored?.revision).toBe(2);
	});

	it("stores nothing when one field is invalid, and reports every issue", async () => {
		const { service, store, write, events } = await makeService([record({ maxOpen: 3 })]);

		const error = await service
			.set(valueCasesSettings, GUILD, { maxOpen: 9, logChannel: TEXT_CHANNEL }, CTX)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(SettingsValidationError);
		expect((error as SettingsValidationError).issues.map((issue) => issue.field)).toStrictEqual([
			"maxOpen",
		]);
		expect(write).not.toHaveBeenCalled();
		expect(await readStored(store)).toStrictEqual(record({ maxOpen: 3 }));
		expect(events).toStrictEqual([]);
	});

	it("reports issues of several invalid fields at once", async () => {
		const { service } = await makeService();

		const error = await service
			.set(valueCasesSettings, GUILD, { maxOpen: 9, enabled: "yes", greeting: "hi" }, CTX)
			.catch((caught: unknown) => caught);

		expect((error as SettingsValidationError).issues.map((issue) => issue.field)).toStrictEqual([
			"maxOpen",
			"enabled",
		]);
	});

	it("throws ConflictError when the expected revision is stale, leaving the record unchanged", async () => {
		const { service, store } = await makeService([record({ maxOpen: 3 })]);
		await service.set(valueCasesSettings, GUILD, { maxOpen: 4 }, { ...CTX, expectedRevision: 1 });

		await expect(
			service.set(valueCasesSettings, GUILD, { maxOpen: 5 }, { ...CTX, expectedRevision: 1 }),
		).rejects.toBeInstanceOf(ConflictError);
		const stored = await readStored(store);
		expect(stored?.values).toStrictEqual({ maxOpen: 4 });
		expect(stored?.revision).toBe(2);
	});

	it("throws ConflictError when a revision is expected but nothing is stored", async () => {
		const { service } = await makeService();

		await expect(
			service.set(valueCasesSettings, GUILD, { maxOpen: 4 }, { ...CTX, expectedRevision: 1 }),
		).rejects.toBeInstanceOf(ConflictError);
	});

	it("emits settings.changed with the changed keys, the new revision and the author", async () => {
		const { service, events } = await makeService([record({ maxOpen: 3 })]);

		await service.set(valueCasesSettings, GUILD, { maxOpen: 4, region: "na" }, CTX);

		expect(events).toStrictEqual([
			{
				guildId: GUILD,
				moduleId: valueCasesSettings.id,
				changedKeys: ["maxOpen", "region"],
				revision: 2,
				changedBy: USER,
			},
		]);
	});

	it("drops stored keys the declaration no longer declares (FR-017)", async () => {
		const { service, store } = await makeService([record({ removed: "old", maxOpen: 3 })]);

		await service.set(valueCasesSettings, GUILD, { region: "na" }, CTX);

		expect((await readStored(store))?.values).toStrictEqual({ maxOpen: 3, region: "na" });
	});

	it("drops stored toggles the declaration no longer declares (FR-017)", async () => {
		const { service, store } = await makeService([
			record({ features: { tickets: false, removed: true } }),
		]);

		await service.set(valueCasesSettings, GUILD, { region: "na" }, CTX);

		expect((await readStored(store))?.values).toStrictEqual({
			features: { tickets: false },
			region: "na",
		});
	});

	it("still rejects an undeclared toggle in a submission", async () => {
		const { service, write } = await makeService([record({ features: { removed: true } })]);

		await expect(
			service.set(valueCasesSettings, GUILD, { features: { removed: true } }, CTX),
		).rejects.toMatchObject({ issues: [{ field: "features.removed", code: "unknownChoice" }] });
		expect(write).not.toHaveBeenCalled();
	});

	it("never overwrites a record written under a newer declaration version (FR-019)", async () => {
		const newer = record({ maxOpen: 3 }, { version: valueCasesSettings.version + 1 });
		const { service, store, write } = await makeService([newer]);

		await expect(
			service.set(valueCasesSettings, GUILD, { maxOpen: 4 }, CTX),
		).rejects.toBeInstanceOf(ConflictError);
		expect(write).not.toHaveBeenCalled();
		expect(await readStored(store)).toStrictEqual(newer);
	});

	it("rejects a request context of another guild without writing", async () => {
		const { service, write } = await makeService();

		await expect(
			service.set(valueCasesSettings, GUILD, { maxOpen: 2 }, { ...CTX, guildId: OTHER_GUILD }),
		).rejects.toBeInstanceOf(ValidationError);
		expect(write).not.toHaveBeenCalled();
	});
});

describe("SettingsService.reset", () => {
	it("removes the given keys so they read as defaults", async () => {
		const { service, store } = await makeService([
			record({ maxOpen: 3, region: "na", enabled: false }),
		]);

		await service.reset(valueCasesSettings, GUILD, ["maxOpen", "region"], CTX);

		const stored = await readStored(store);
		expect(stored?.values).toStrictEqual({ enabled: false });
		expect(stored?.revision).toBe(2);
		expect(stored?.updatedAt).toBe(NOW);
		expect(stored?.updatedBy).toBe(USER);
		const values = await service.get(valueCasesSettings, GUILD);
		expect(values.maxOpen).toBe(1);
		expect(values.region).toBe("eu");
	});

	it('removes every value with "all", required fields included', async () => {
		const { service, store } = await makeService([
			record({ maxOpen: 3, logChannel: TEXT_CHANNEL, removed: "old" }),
		]);

		await service.reset(valueCasesSettings, GUILD, "all", CTX);

		expect((await readStored(store))?.values).toStrictEqual({});
	});

	it("emits settings.changed with the reset keys", async () => {
		const { service, events } = await makeService([record({ maxOpen: 3, region: "na" })]);

		await service.reset(valueCasesSettings, GUILD, ["maxOpen"], CTX);

		expect(events).toStrictEqual([
			{
				guildId: GUILD,
				moduleId: valueCasesSettings.id,
				changedKeys: ["maxOpen"],
				revision: 2,
				changedBy: USER,
			},
		]);
	});

	it("writes nothing for a guild that never stored settings", async () => {
		const { service, write, events } = await makeService();

		await service.reset(valueCasesSettings, GUILD, "all", CTX);

		expect(write).not.toHaveBeenCalled();
		expect(events).toStrictEqual([]);
	});

	it("rejects keys the declaration does not declare without writing", async () => {
		const { service, write } = await makeService([record({ maxOpen: 3 })]);

		const error = await service
			.reset(valueCasesSettings, GUILD, ["maxOpen", "removed"], CTX)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(SettingsValidationError);
		expect((error as SettingsValidationError).issues).toStrictEqual([
			{
				field: "removed",
				code: "unknownField",
				translation: { key: SETTINGS_ISSUE_MESSAGES.unknownField },
			},
		]);
		expect(write).not.toHaveBeenCalled();
	});

	it("never overwrites a record written under a newer declaration version (FR-019)", async () => {
		const newer = record({ maxOpen: 3 }, { version: valueCasesSettings.version + 1 });
		const { service, write } = await makeService([newer]);

		await expect(service.reset(valueCasesSettings, GUILD, "all", CTX)).rejects.toBeInstanceOf(
			ConflictError,
		);
		expect(write).not.toHaveBeenCalled();
	});

	it("rejects a request context of another guild without writing", async () => {
		const { service, write } = await makeService([record({ maxOpen: 3 })]);

		await expect(
			service.reset(valueCasesSettings, GUILD, "all", { ...CTX, guildId: OTHER_GUILD }),
		).rejects.toBeInstanceOf(ValidationError);
		expect(write).not.toHaveBeenCalled();
	});
});
