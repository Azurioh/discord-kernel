import { MessageFlags } from "discord.js";
import { describe, expect, it } from "vitest";
import type { BotState } from "@/bot/create-bot";
import { LifecycleDispatcher } from "@/bot/lifecycle-dispatcher";
import { createDefaultPresenter } from "@/discord/default-presenter";
import { CORE_CATALOG, CORE_MESSAGES } from "@/discord/i18n";
import { TranslationRegistry } from "@/i18n/catalog";
import { createTranslator } from "@/i18n/translator";
import { createBotInteraction } from "../support/bot-interaction";
import { createFakeLocaleResolver } from "../support/fake-locale-resolver";
import { createFakeLogger } from "../support/fake-logger";

const KINDS = ["slash", "contextMenu", "button", "selectMenu", "modal", "autocomplete"] as const;
const BLOCKED_STATES = ["created", "starting", "stopping", "stopped"] as const;

function dispatcher(state: BotState) {
	const logger = createFakeLogger();
	const registry = new TranslationRegistry();
	registry.register(CORE_CATALOG);
	const translator = createTranslator(registry, { defaultLocale: "en", logger });
	return {
		translator,
		dispatcher: new LifecycleDispatcher({
			state: () => state,
			logger,
			translator,
			presenter: createDefaultPresenter(translator),
			localeResolver: createFakeLocaleResolver("fr"),
		}),
	};
}

describe("LifecycleDispatcher", () => {
	it.each(BLOCKED_STATES.flatMap((state) => KINDS.map((kind) => ({ state, kind }))))(
		"denies $kind while $state in the resolved locale",
		async ({ state, kind }) => {
			const subject = dispatcher(state);
			const interaction = createBotInteraction({
				kind,
				name: "test",
				guildId: "guild",
				locale: "de",
			});
			expect(
				await Reflect.apply(subject.dispatcher.handle, subject.dispatcher, [interaction]),
			).toBe(true);
			if (kind === "autocomplete") {
				expect(interaction.respond).toHaveBeenCalledExactlyOnceWith([]);
				expect(interaction.reply).not.toHaveBeenCalled();
			} else {
				expect(interaction.reply).toHaveBeenCalledExactlyOnceWith({
					flags: MessageFlags.Ephemeral,
					embeds: [
						expect.objectContaining({
							data: expect.objectContaining({
								description: subject.translator.translate("fr", CORE_MESSAGES.botRestarting),
							}),
						}),
					],
				});
				expect(interaction.respond).not.toHaveBeenCalled();
			}
		},
	);

	it.each(KINDS)("lets %s reach its router when running", async (kind) => {
		const subject = dispatcher("running");
		const interaction = createBotInteraction({ kind, name: "test", guildId: "guild" });
		expect(await Reflect.apply(subject.dispatcher.handle, subject.dispatcher, [interaction])).toBe(
			false,
		);
		expect(interaction.reply).not.toHaveBeenCalled();
		expect(interaction.respond).not.toHaveBeenCalled();
	});
});
