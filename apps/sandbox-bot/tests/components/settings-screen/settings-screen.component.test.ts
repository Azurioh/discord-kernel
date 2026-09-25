import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import {
	editorComponentIds,
	mountSettingsEditor,
	settingsEditorFromDeclaration,
} from "@azurioh/discord-kernel/discord/components/settings-editor";
import { TranslationRegistry } from "@azurioh/discord-kernel/i18n/catalog";
import { createTranslator } from "@azurioh/discord-kernel/i18n/translator";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { showSettingsScreen } from "@/components/settings-screen/settings-screen.component";
import { DEMO_CATALOG } from "@/modules/demo/i18n/demo.catalog";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { demoSettings } from "@/modules/demo/settings/demo.settings";
import { createPinoLogger } from "@/shared/logging/pino-logger";

vi.mock("@azurioh/discord-kernel/discord/components/settings-editor", async (importOriginal) => ({
	...(await importOriginal<object>()),
	settingsEditorFromDeclaration: vi.fn(),
	mountSettingsEditor: vi.fn(),
}));

const logger = createPinoLogger("test", { write: () => undefined });
const settings = {} as SettingsService;

/** What the adapter returns, stood in by markers the test can find again. */
const ADAPTED = { fields: ["fields"], levels: ["levels"], initial: { values: {} } };

function createFrenchContext(guildId: string | null) {
	const registry = new TranslationRegistry();
	registry.register(DEMO_CATALOG);
	const translator = createTranslator(registry, { defaultLocale: "en", logger });
	const interaction = { guildId, user: { id: "admin" } } as ChatInputCommandInteraction;
	const ctx = {
		interaction,
		locale: "fr",
		options: {},
		t: (key: string) => translator.translate("fr", key),
	} as unknown as Context<Record<string, never>>;
	return { ctx, interaction, translator };
}

describe("showSettingsScreen", () => {
	it("mounts the kernel editor with the adapter's output, the ids and the app's chrome", async () => {
		vi.mocked(settingsEditorFromDeclaration).mockResolvedValue(ADAPTED as never);
		const { ctx, interaction, translator } = createFrenchContext("guild");

		await showSettingsScreen(ctx, {
			declaration: demoSettings,
			settings,
			translator,
			logger,
			idPrefix: "screen",
			introKey: DEMO_MESSAGES.editIntro,
		});

		expect(settingsEditorFromDeclaration).toHaveBeenCalledWith(demoSettings, settings, {
			guildId: "guild",
			userId: "admin",
			locale: "fr",
			translator,
		});
		const [target, options] = vi.mocked(mountSettingsEditor).mock.calls[0] ?? [];
		expect(target).toBe(interaction);
		expect(options).toMatchObject({
			...ADAPTED,
			ids: editorComponentIds("screen"),
			translator,
			locale: "fr",
			logger,
		});
		if (options?.chrome.layout !== "card") {
			throw new Error("expected the card layout");
		}
		expect(options.chrome.titleKey).toBe(demoSettings.labels.title);
		expect(options.chrome.preview(ADAPTED as never)).toEqual([
			{ kind: "text", content: DEMO_CATALOG[DEMO_MESSAGES.editIntro].fr },
		]);
	});

	it("refuses to open outside a guild, before reading any setting", async () => {
		const { ctx, translator } = createFrenchContext(null);

		await expect(
			showSettingsScreen(ctx, {
				declaration: demoSettings,
				settings,
				translator,
				logger,
				idPrefix: "screen",
				introKey: DEMO_MESSAGES.editIntro,
			}),
		).rejects.toThrow("guild");
		expect(settingsEditorFromDeclaration).not.toHaveBeenCalled();
	});
});
