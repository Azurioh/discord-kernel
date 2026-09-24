import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { fixedClock } from "@/clock";
import type { Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import type { SettingsStore, StoredSettings } from "@/settings/ports/settings-store";
import type { SettingsRegistry } from "@/settings/registry";
import { createSettingsService } from "@/settings/settings-service";
import type { SecretState, SurfaceValues } from "@/settings/types";
import { sampleSettings } from "./fixtures/sample-declaration";

const GUILD = "100000000000000001";
const SECRET = "s3cr3t";

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

async function makeService(stored: readonly StoredSettings[] = []) {
	const store: SettingsStore = createInMemorySettingsStore();
	for (const entry of stored) {
		await store.write(entry, { expectedRevision: null });
	}
	const write = vi.spyOn(store, "write");
	const logger = makeLogger();
	const service = createSettingsService({
		// Reads never consult the registry: the declaration is passed in.
		registry: {} as SettingsRegistry,
		store,
		guilds: createInMemoryGuildDirectory({}),
		notifier: createInProcessNotifier(logger),
		translator: {} as Translator,
		clock: fixedClock(new Date("2026-01-01T00:00:00.000Z")),
		logger,
	});
	return { service, write };
}

describe("SettingsService.getForSurface", () => {
	it("reports a set secret as set, never its value", async () => {
		const { service } = await makeService([record({ apiKey: SECRET, maxOpen: 3 })]);

		const values = await service.getForSurface(sampleSettings, GUILD);

		expect(values.apiKey).toStrictEqual({ isSet: true });
		expect(JSON.stringify(values)).not.toContain(SECRET);
		expect(values.maxOpen).toBe(3);
	});

	it("reports an unset secret as not set", async () => {
		const { service } = await makeService();

		const values = await service.getForSurface(sampleSettings, GUILD);

		expect(values.apiKey).toStrictEqual({ isSet: false });
	});

	it("returns every other field as module logic reads it, and writes nothing", async () => {
		const { service, write } = await makeService([record({ apiKey: SECRET, region: "na" })]);

		const surface = await service.getForSurface(sampleSettings, GUILD);
		const { apiKey: _secret, ...logic } = await service.get(sampleSettings, GUILD);

		expect(surface).toStrictEqual({ ...logic, apiKey: { isSet: true } });
		expect(write).not.toHaveBeenCalled();
	});

	it("is typed with secrets as their state", async () => {
		const { service } = await makeService();

		const values = await service.getForSurface(sampleSettings, GUILD);

		expectTypeOf(values).toEqualTypeOf<SurfaceValues<typeof sampleSettings>>();
		expectTypeOf(values.apiKey).toEqualTypeOf<SecretState>();
	});
});
