import { vi } from "vitest";
import { fixedClock } from "@/clock";
import type { Translator } from "@/i18n/translator";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import type { SettingsStore, StoredSettings } from "@/settings/ports/settings-store";
import type { SettingsRegistry } from "@/settings/registry";
import { createSettingsService } from "@/settings/settings-service";
import { createFakeLogger } from "../../support/fake-logger";

/**
 * A settings service over an in-memory store seeded with `stored`, for suites
 * that only read: the registry and the translator are empty stand-ins, since
 * reads take the declaration as an argument and translate nothing. `write`
 * spies on the store so a suite can assert a read wrote nothing.
 */
export async function createReadOnlySettingsService(stored: readonly StoredSettings[] = []) {
	const store: SettingsStore = createInMemorySettingsStore();
	for (const entry of stored) {
		await store.write(entry, { expectedRevision: null });
	}
	const write = vi.spyOn(store, "write");
	const logger = createFakeLogger();
	const service = createSettingsService({
		registry: {} as SettingsRegistry,
		store,
		guilds: createInMemoryGuildDirectory({}),
		notifier: createInProcessNotifier(logger),
		translator: {} as Translator,
		clock: fixedClock(new Date("2026-01-01T00:00:00.000Z")),
		logger,
	});
	return { service, write, logger };
}
