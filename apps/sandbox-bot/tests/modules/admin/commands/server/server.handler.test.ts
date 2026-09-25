import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import { TranslationRegistry } from "@azurioh/discord-kernel/i18n/catalog";
import { createTranslator } from "@azurioh/discord-kernel/i18n/translator";
import {
	createSettingsRegistry,
	SETTINGS_CATALOG,
	type SettingsService,
} from "@azurioh/discord-kernel/settings";
import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { showSettingsScreen } from "@/components/settings-screen/settings-screen.component";
import { createServerHandler } from "@/modules/admin/commands/server/server.handler";
import { ADMIN_MESSAGES } from "@/modules/admin/i18n/admin.messages";
import { createPinoLogger } from "@/shared/logging/pino-logger";

vi.mock("@/components/settings-screen/settings-screen.component", () => ({
	showSettingsScreen: vi.fn(),
}));

const logger = createPinoLogger("test", { write: () => undefined });

describe("createServerHandler", () => {
	it("shows the settings screen over the kernel declaration", async () => {
		const translations = new TranslationRegistry();
		translations.register(SETTINGS_CATALOG);
		const translator = createTranslator(translations, { defaultLocale: "en", logger });
		const registry = createSettingsRegistry({
			declarations: [],
			translations,
			modules: [{ name: "demo" }],
		});
		const settings = {} as SettingsService;
		const ctx = {
			interaction: {} as ChatInputCommandInteraction,
		} as unknown as Context<Record<string, never>>;

		await createServerHandler({
			settings: () => settings,
			kernelSettings: () => registry.kernel,
			translator,
			logger,
		})(ctx);

		expect(showSettingsScreen).toHaveBeenCalledWith(ctx, {
			declaration: registry.kernel,
			settings,
			translator,
			logger,
			idPrefix: "admin-server",
			introKey: ADMIN_MESSAGES.serverIntro,
		});
	});
});
