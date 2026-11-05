import {
	type APIContainerComponent,
	ContainerBuilder,
	EmbedBuilder,
	Events,
	MessageFlags,
} from "discord.js";
import { describe, expect, it } from "vitest";
import { type BotOptions, createBot } from "@/bot/create-bot";
import { createInMemoryProcess } from "@/bot/in-memory-process";
import { createCommand } from "@/discord/command/create-command";
import type { Guard } from "@/discord/command/guard";
import type { RoutableInteraction } from "@/discord/components/component-router";
import { CORE_MESSAGES } from "@/discord/i18n";
import type { Presenter } from "@/discord/presenter";
import { createInMemoryLogger } from "@/in-memory-logger";
import type { BotModule } from "@/module/module";
import { createInMemoryScheduler } from "@/scheduler/in-memory-scheduler";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { SETTINGS_MESSAGES } from "@/settings/messages";
import {
	createBotInteraction,
	dispatchClientEvent,
	startFakeBot,
} from "../support/bot-interaction";
import { createFakeClient } from "../support/fake-client";
import { createV2Presenter } from "../support/v2-presenter";

const GUILD = "100000000000000001";
const DENIED = "Denied.";
const DENY: Guard & Guard<RoutableInteraction> = { check: () => ({ ok: false, message: DENIED }) };

type Kind =
	| "systemError"
	| "guardDenial"
	| "moduleDisabled"
	| "moduleUnavailable"
	| "restarting"
	| "componentDenial";

/** What a scenario sent and the presenter text it should carry. */
interface Outcome {
	readonly payloads: readonly { readonly method: string; readonly payload: unknown }[];
	/** The presenter method's name and message, as `createV2Presenter` writes them. */
	readonly expected: string;
	/** The message alone, as the default presenter's embed description. */
	readonly message: string;
}

function botWith(modules: readonly BotModule[], presenter: Presenter | undefined) {
	const logger = createInMemoryLogger();
	const options: BotOptions = {
		modules,
		logger,
		settingsStore: createInMemorySettingsStore(),
		discord: { client: createFakeClient() },
		adapters: {
			guilds: createInMemoryGuildDirectory({}),
			scheduler: createInMemoryScheduler(),
			...(presenter === undefined ? {} : { presenter }),
		},
		lifecycle: { process: createInMemoryProcess() },
	};
	return { bot: createBot(options), logger };
}

async function interact(bot: ReturnType<typeof createBot>, kind: "slash" | "button", name: string) {
	const interaction = createBotInteraction({ kind, name, guildId: GUILD });
	await dispatchClientEvent({
		client: bot.client,
		event: Events.InteractionCreate,
		args: [interaction],
	});
	return interaction;
}

const command = (name: string, extra: { guard?: Guard } = {}) =>
	createCommand({
		name,
		description: "Test",
		...extra,
		handler: async () => {
			throw new TypeError("boom");
		},
	});

/** Run one kernel reply path end to end and report what reached the interaction. */
async function run(kind: Kind, presenter: Presenter | undefined): Promise<Outcome> {
	switch (kind) {
		case "systemError": {
			const { bot, logger } = botWith([{ name: "test", commands: [command("fail")] }], presenter);
			await startFakeBot({ bot });
			const interaction = await interact(bot, "slash", "fail");
			await bot.stop();
			const reference = logger.entries.find((entry) => entry.message === "Command handler failed")
				?.fields.ref;
			const message = bot.translator.translate("en", CORE_MESSAGES.genericError);
			return {
				payloads: interaction.sentPayloads(),
				expected: `systemError: ${message} (${String(reference)})`,
				message,
			};
		}
		case "guardDenial": {
			const { bot } = botWith(
				[{ name: "test", commands: [command("guarded", { guard: DENY })] }],
				presenter,
			);
			await startFakeBot({ bot });
			const interaction = await interact(bot, "slash", "guarded");
			await bot.stop();
			return {
				payloads: interaction.sentPayloads(),
				expected: `denial: ${DENIED}`,
				message: DENIED,
			};
		}
		case "moduleDisabled": {
			const { bot } = botWith([{ name: "test", commands: [command("off")] }], presenter);
			await bot.settings.set(
				bot.registry.kernel,
				GUILD,
				{ modules: { test: false } },
				{ guildId: GUILD, userId: "admin", locale: "en" },
			);
			await startFakeBot({ bot });
			const interaction = await interact(bot, "slash", "off");
			await bot.stop();
			const message = bot.translator.translate("en", SETTINGS_MESSAGES.moduleDisabled);
			return { payloads: interaction.sentPayloads(), expected: `denial: ${message}`, message };
		}
		case "moduleUnavailable": {
			const { bot } = botWith(
				[
					{
						name: "test",
						optional: true,
						setup: () => {
							throw new TypeError("setup");
						},
						commands: [command("gone")],
					},
				],
				presenter,
			);
			await startFakeBot({ bot });
			const interaction = await interact(bot, "slash", "gone");
			await bot.stop();
			const message = bot.translator.translate("en", CORE_MESSAGES.moduleUnavailable);
			return { payloads: interaction.sentPayloads(), expected: `denial: ${message}`, message };
		}
		case "restarting": {
			const { bot } = botWith([{ name: "test", commands: [command("early")] }], presenter);
			const interaction = await interact(bot, "slash", "early");
			const message = bot.translator.translate("en", CORE_MESSAGES.botRestarting);
			return { payloads: interaction.sentPayloads(), expected: `denial: ${message}`, message };
		}
		case "componentDenial": {
			const { bot } = botWith(
				[
					{
						name: "test",
						components: [
							{
								customId: "press",
								authorize: { kind: "anyone", because: "Public test action" },
								guard: DENY,
								handle: () => undefined,
							},
						],
					},
				],
				presenter,
			);
			await startFakeBot({ bot });
			const interaction = await interact(bot, "button", "press");
			await bot.stop();
			return {
				payloads: interaction.sentPayloads(),
				expected: `denial: ${DENIED}`,
				message: DENIED,
			};
		}
		default:
			return kind satisfies never;
	}
}

/** The text of the single text display inside a payload's single container. */
function containerText(payload: unknown): string | undefined {
	const { components } = payload as { components: readonly ContainerBuilder[] };
	expect(components).toHaveLength(1);
	expect(components[0]).toBeInstanceOf(ContainerBuilder);
	const json = components[0]?.toJSON() as APIContainerComponent;
	const [text] = json.components;
	return text !== undefined && "content" in text ? text.content : undefined;
}

const KINDS: readonly Kind[] = [
	"systemError",
	"guardDenial",
	"moduleDisabled",
	"moduleUnavailable",
	"restarting",
	"componentDenial",
];

describe("kernel replies with a V2 presenter", () => {
	it.each(KINDS)("answers %s in Components V2", async (kind) => {
		const outcome = await run(kind, createV2Presenter());
		expect(outcome.payloads).toHaveLength(1);
		const [sent] = outcome.payloads;
		expect(sent?.payload).toMatchObject({
			flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
		});
		expect(sent?.payload).not.toHaveProperty("embeds");
		expect(containerText(sent?.payload)).toBe(outcome.expected);
	});
});

describe("kernel replies with the default presenter", () => {
	it.each(KINDS)("answers %s with a V1 embed", async (kind) => {
		const outcome = await run(kind, undefined);
		expect(outcome.payloads).toHaveLength(1);
		const [sent] = outcome.payloads;
		expect(sent?.payload).toStrictEqual({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({ description: outcome.message }),
				}),
			],
			components: [],
			flags: [MessageFlags.Ephemeral],
		});
		expect(sent?.payload).toHaveProperty(["embeds", 0], expect.any(EmbedBuilder));
	});
});
