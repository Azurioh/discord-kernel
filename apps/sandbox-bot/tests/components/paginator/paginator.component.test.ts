import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import { TranslationRegistry } from "@azurioh/discord-kernel/i18n/catalog";
import { createTranslator } from "@azurioh/discord-kernel/i18n/translator";
import type {
	ActionRowBuilder,
	ButtonBuilder,
	ChatInputCommandInteraction,
	EmbedBuilder,
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { PAGINATOR_CATALOG } from "@/components/paginator/i18n/paginator-catalog";
import { showPaginator } from "@/components/paginator/paginator.component";
import { createPinoLogger } from "@/shared/logging/pino-logger";

const logger = createPinoLogger("test", { write: () => undefined });

interface SentPage {
	readonly embeds: readonly EmbedBuilder[];
	readonly components: readonly ActionRowBuilder<ButtonBuilder>[];
}

/** A deferred `/pages` answered in French, recording what the paginator sends. */
function createFrenchContext() {
	const registry = new TranslationRegistry();
	registry.register(PAGINATOR_CATALOG);
	const translator = createTranslator(registry, { defaultLocale: "en", logger });
	const collector = { on: vi.fn() };
	const response = { createMessageComponentCollector: vi.fn(() => collector) };
	const editReply = vi.fn(async (_page: SentPage) => response);
	const ctx = {
		interaction: { user: { id: "owner" }, editReply } as unknown as ChatInputCommandInteraction,
		locale: "fr",
		options: {},
		t: (key: string, params?: Readonly<Record<string, string | number>>) =>
			translator.translate("fr", key, params),
	} as unknown as Context<Record<string, never>>;
	return { ctx, editReply, response };
}

function items(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `Item ${index + 1}`);
}

describe("showPaginator", () => {
	it("lays out the first page as the app's embed: title, one item per line, translated footer", async () => {
		const { ctx, editReply } = createFrenchContext();

		await showPaginator(ctx, { title: "Liste", items: items(12), logger });

		const embed = editReply.mock.calls[0]?.[0].embeds[0]?.toJSON();
		expect(embed?.title).toBe("Liste");
		expect(embed?.description).toBe(items(5).join("\n"));
		expect(embed?.footer?.text).toBe("Page 1/3 · 12 éléments");
	});

	it("labels the navigation buttons in the member's language and starts on the first page", async () => {
		const { ctx, editReply, response } = createFrenchContext();

		await showPaginator(ctx, { title: "Liste", items: items(12), logger });

		const buttons = editReply.mock.calls[0]?.[0].components[0]?.toJSON().components;
		expect(buttons).toEqual([
			expect.objectContaining({ label: "Précédent", disabled: true }),
			expect.objectContaining({ label: "Suivant", disabled: false }),
		]);
		expect(response.createMessageComponentCollector).toHaveBeenCalledOnce();
	});

	it("shows a single page without buttons nor collector", async () => {
		const { ctx, editReply, response } = createFrenchContext();

		await showPaginator(ctx, { title: "Liste", items: items(3), logger });

		expect(editReply.mock.calls[0]?.[0].components).toEqual([]);
		expect(response.createMessageComponentCollector).not.toHaveBeenCalled();
	});
});
