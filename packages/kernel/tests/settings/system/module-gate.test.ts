import { describe, expect, it, vi } from "vitest";
import { fixedClock } from "@/clock";
import { TranslationRegistry } from "@/i18n/catalog";
import type { Translator } from "@/i18n/translator";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import { SETTINGS_CATALOG } from "@/settings/messages";
import { createSettingsRegistry } from "@/settings/registry";
import { createSettingsService } from "@/settings/settings-service";
import { createModuleGate } from "@/settings/system/module-gate";
import { createFakeLogger } from "../../support/fake-logger";

const GUILD_A = "100000000000000001";
const GUILD_B = "100000000000000002";
const CTX = { guildId: GUILD_A, userId: "400000000000000001", locale: "en" };

function makeGate() {
	const translations = new TranslationRegistry();
	translations.register(SETTINGS_CATALOG);
	const registry = createSettingsRegistry({
		declarations: [],
		translations,
		modules: [{ name: "tickets" }, { name: "beta", defaultEnabled: false }],
	});
	const logger = createFakeLogger();
	const store = createInMemorySettingsStore();
	const service = createSettingsService({
		registry,
		store,
		guilds: createInMemoryGuildDirectory({}),
		notifier: createInProcessNotifier(logger),
		translator: {} as Translator,
		clock: fixedClock(new Date("2026-01-01T00:00:00.000Z")),
		logger,
	});
	const gate = createModuleGate({ service, registry, logger });
	return { gate, service, registry, store, logger };
}

describe("createModuleGate", () => {
	it("enables a module by default on a guild that never toggled it", async () => {
		const { gate } = makeGate();

		expect(await gate.isEnabled("tickets", GUILD_A)).toBe(true);
	});

	it("disables a module declared defaultEnabled: false on an unconfigured guild (S16)", async () => {
		const { gate } = makeGate();

		expect(await gate.isEnabled("beta", GUILD_A)).toBe(false);
	});

	it("follows the guild's toggles, per guild", async () => {
		const { gate, service, registry } = makeGate();

		await service.set(registry.kernel, GUILD_A, { modules: { tickets: false, beta: true } }, CTX);

		expect(await gate.isEnabled("tickets", GUILD_A)).toBe(false);
		expect(await gate.isEnabled("beta", GUILD_A)).toBe(true);
		expect(await gate.isEnabled("tickets", GUILD_B)).toBe(true);
		expect(await gate.isEnabled("beta", GUILD_B)).toBe(false);
	});

	it("never gates a module the kernel declaration does not know", async () => {
		const { gate } = makeGate();

		expect(await gate.isEnabled("unregistered", GUILD_A)).toBe(true);
	});

	it("lets the module run and logs the error when the settings cannot be read", async () => {
		const { gate, store, logger } = makeGate();
		vi.spyOn(store, "read").mockRejectedValue(new Error("store down"));

		expect(await gate.isEnabled("tickets", GUILD_A)).toBe(true);
		expect(logger.error).toHaveBeenCalledWith(
			{ module: "tickets", guildId: GUILD_A, err: "store down" },
			"Could not read whether the module is enabled; letting it run",
		);
	});
});
