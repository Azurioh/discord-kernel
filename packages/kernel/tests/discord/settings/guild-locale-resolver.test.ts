import { describe, expect, it, vi } from "vitest";
import { fixedClock } from "@/clock";
import { createGuildLocaleResolver } from "@/discord/settings/guild-locale-resolver";
import { TranslationRegistry } from "@/i18n/catalog";
import type { Translator } from "@/i18n/translator";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import { SETTINGS_CATALOG } from "@/settings/messages";
import { createSettingsRegistry } from "@/settings/registry";
import { createSettingsService } from "@/settings/settings-service";
import { createFakeLogger } from "../../support/fake-logger";

const GUILD_A = "100000000000000001";
const CTX = { guildId: GUILD_A, userId: "400000000000000001", locale: "en" };

function makeResolver() {
	const translations = new TranslationRegistry();
	translations.register(SETTINGS_CATALOG);
	const registry = createSettingsRegistry({ declarations: [], translations });
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
	const translator = { defaultLocale: "en" } as Translator;
	const resolver = createGuildLocaleResolver({ service, registry, translator });
	return { resolver, service, registry, store };
}

describe("createGuildLocaleResolver (FR-038, S17)", () => {
	it("prefers a supported member locale over the guild setting", async () => {
		const { resolver, service, registry } = makeResolver();
		await service.set(registry.kernel, GUILD_A, { locale: "en" }, CTX);

		expect(await resolver.resolve({ locale: "fr", guildLocale: "en-US", guildId: GUILD_A })).toBe(
			"fr",
		);
	});

	it("uses the guild setting when the member locale is not supported", async () => {
		const { resolver, service, registry } = makeResolver();
		await service.set(registry.kernel, GUILD_A, { locale: "fr" }, CTX);

		expect(await resolver.resolve({ locale: "de", guildLocale: "en-US", guildId: GUILD_A })).toBe(
			"fr",
		);
	});

	it("falls back to the guild's Discord locale when no language is set", async () => {
		const { resolver } = makeResolver();

		expect(await resolver.resolve({ locale: "de", guildLocale: "fr", guildId: GUILD_A })).toBe(
			"fr",
		);
	});

	it("falls back to the translator's default when nothing is supported", async () => {
		const { resolver } = makeResolver();

		expect(await resolver.resolve({ locale: "de", guildLocale: "ja", guildId: GUILD_A })).toBe(
			"en",
		);
	});

	it("reads no setting outside a guild", async () => {
		const { resolver, store } = makeResolver();
		const read = vi.spyOn(store, "read");

		expect(await resolver.resolve({ locale: "de", guildLocale: null, guildId: null })).toBe("en");
		expect(read).not.toHaveBeenCalled();
	});

	it("reads no setting when the member locale is supported", async () => {
		const { resolver, store } = makeResolver();
		const read = vi.spyOn(store, "read").mockRejectedValue(new Error("store down"));

		expect(await resolver.resolve({ locale: "fr", guildLocale: "en", guildId: GUILD_A })).toBe(
			"fr",
		);
		expect(read).not.toHaveBeenCalled();
	});

	it("rejects when the setting cannot be read, so the caller logs and falls back", async () => {
		const { resolver, store } = makeResolver();
		vi.spyOn(store, "read").mockRejectedValue(new Error("store down"));

		await expect(
			resolver.resolve({ locale: "de", guildLocale: "fr", guildId: GUILD_A }),
		).rejects.toThrow("store down");
	});
});
