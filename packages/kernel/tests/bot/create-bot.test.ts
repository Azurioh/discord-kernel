import { EmbedBuilder, Events } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { DuplicateModuleError, ModuleRegistrationError } from "@/bot/bot-errors";
import { type BotOptions, createBot } from "@/bot/create-bot";
import { fixedClock } from "@/clock";
import { createCommand } from "@/discord/command/create-command";
import { createEvent } from "@/discord/events/create-event";
import { CORE_MESSAGES } from "@/discord/i18n";
import { createFixedLocaleResolver } from "@/discord/interaction/fixed-locale-resolver";
import { DuplicateTranslationKeyError } from "@/i18n/errors";
import { createInMemoryLogger } from "@/in-memory-logger";
import type { BotModule } from "@/module/module";
import type { ModuleContext } from "@/module/module-context";
import { defineSettings } from "@/settings/define-settings";
import { field } from "@/settings/fields/builders";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { SettingsDeclarationError } from "@/settings/settings-declaration-error";
import { createBotInteraction, dispatchClientEvent } from "../support/bot-interaction";
import { createFakeClient } from "../support/fake-client";

const GUILD_A = "100000000000000001";
const GUILD_B = "100000000000000002";
const TEST_MESSAGES = { title: "test.title", enabled: "test.enabled" } as const;
const CATALOG = {
	[TEST_MESSAGES.title]: { en: "Test", fr: "Test" },
	[TEST_MESSAGES.enabled]: { en: "Enabled", fr: "Activé" },
};
const DECLARATION = defineSettings({
	id: "test",
	version: 1,
	labels: { title: TEST_MESSAGES.title },
	fields: { enabled: field.boolean({ label: TEST_MESSAGES.enabled, default: true }) },
});

function options(modules: readonly BotModule[]): BotOptions & {
	logger: ReturnType<typeof createInMemoryLogger>;
	discord: { client: ReturnType<typeof createFakeClient> };
} {
	return {
		modules,
		logger: createInMemoryLogger(),
		settingsStore: createInMemorySettingsStore(),
		discord: { client: createFakeClient() },
		adapters: { guilds: createInMemoryGuildDirectory({}) },
	};
}

function command(name: string) {
	return { data: { name }, dispatch: vi.fn(async () => undefined) };
}

function component(name: string) {
	return {
		customId: name,
		authorize: { kind: "anyone", because: "Public test action" } as const,
		handle: vi.fn(async () => undefined),
	};
}

async function interact(params: {
	bot: ReturnType<typeof createBot>;
	kind: "slash" | "contextMenu" | "button" | "autocomplete";
	name: string;
	guildId?: string;
	locale?: string;
}) {
	const interaction = createBotInteraction({
		kind: params.kind,
		name: params.name,
		guildId: params.guildId ?? GUILD_A,
		locale: params.locale,
	});
	await dispatchClientEvent({
		client: params.bot.client,
		event: Events.InteractionCreate,
		args: [interaction],
	});
	return interaction;
}

describe("createBot", () => {
	it("(a) assembles every module contribution without manual router wiring", async () => {
		const first = command("first");
		const second = command("second");
		const button = component("button");
		const execute = vi.fn(async () => undefined);
		const bot = createBot(
			options([
				{ name: "one", translations: CATALOG, settings: [DECLARATION], commands: [first] },
				{
					name: "two",
					commands: [second],
					components: [button],
					events: [createEvent({ name: Events.MessageCreate, execute })],
				},
			]),
		);
		expect(bot.translator.translate("fr", TEST_MESSAGES.enabled)).toBe("Activé");
		expect(bot.registry.get(DECLARATION.id)).toBe(DECLARATION);
		await interact({ bot, kind: "slash", name: "first" });
		await interact({ bot, kind: "slash", name: "second" });
		await interact({ bot, kind: "button", name: "button" });
		await dispatchClientEvent({
			client: bot.client,
			event: Events.MessageCreate,
			args: [{ guildId: GUILD_A }],
		});
		expect(first.dispatch).toHaveBeenCalledOnce();
		expect(second.dispatch).toHaveBeenCalledOnce();
		expect(button.handle).toHaveBeenCalledOnce();
		expect(execute).toHaveBeenCalledOnce();
	});

	it("(b) builds once with finished services and a module-bound logger", async () => {
		let read: Promise<unknown> | undefined;
		const built = command("built");
		const build = vi.fn((context: ModuleContext) => {
			read = context.settings.get(DECLARATION, GUILD_A);
			context.logger.info({}, "built");
			return { commands: [built] };
		});
		const input = options([
			{ name: "test", translations: CATALOG, settings: [DECLARATION], build },
		]);
		const bot = createBot(input);
		expect(await read).toEqual({ enabled: true });
		expect(input.logger.entries).toContainEqual({
			level: "info",
			fields: { module: "test" },
			message: "built",
		});
		await interact({ bot, kind: "slash", name: "built" });
		expect(built.dispatch).toHaveBeenCalledOnce();
		expect(build).toHaveBeenCalledOnce();
		expect(build.mock.calls[0]?.[0]).toMatchObject({
			settings: bot.settings,
			registry: bot.registry,
		});
	});

	it("(c) rejects duplicate names before login or build", () => {
		const build = vi.fn();
		const input = options([{ name: "same", build }, { name: "same" }]);
		expect(() => createBot(input)).toThrowError(DuplicateModuleError);
		try {
			createBot(input);
		} catch (error) {
			expect(error).toMatchObject({ first: "same", second: "same" });
		}
		expect(input.discord.client.login).not.toHaveBeenCalled();
		expect(build).not.toHaveBeenCalled();
	});

	it("(d) attributes duplicate catalog keys to the second module", () => {
		expect(() =>
			createBot(
				options([
					{ name: "first", translations: CATALOG },
					{ name: "second", translations: CATALOG },
				]),
			),
		).toThrowError(
			expect.objectContaining({
				moduleName: "second",
				cause: expect.any(DuplicateTranslationKeyError),
			}),
		);
	});

	it("(e) validates declarations within their owning module", () => {
		expect(() => createBot(options([{ name: "broken", settings: [DECLARATION] }]))).toThrowError(
			expect.objectContaining({
				moduleName: "broken",
				cause: expect.any(SettingsDeclarationError),
			}),
		);
	});

	it("(e2) attributes a declaration id shared across modules to the second", () => {
		expect(() =>
			createBot(
				options([
					{ name: "first", translations: CATALOG, settings: [DECLARATION] },
					{ name: "second", settings: [DECLARATION] },
				]),
			),
		).toThrowError(
			expect.objectContaining({
				moduleName: "second",
				cause: expect.any(SettingsDeclarationError),
			}),
		);
	});

	it("(f) wraps build failures with the module and original cause", () => {
		const cause = new TypeError("build failed");
		expect(() =>
			createBot(
				options([
					{
						name: "broken",
						build() {
							throw cause;
						},
					},
				]),
			),
		).toThrowError(
			expect.objectContaining({ name: "ModuleRegistrationError", moduleName: "broken", cause }),
		);
	});

	it.each(["setup", "commands"] as const)("(g) rejects duplicate %s contributions", (part) => {
		const parts = part === "setup" ? { setup: vi.fn() } : { commands: [] };
		expect(() =>
			createBot(options([{ name: "duplicate", ...parts, build: () => parts }])),
		).toThrowError(expect.objectContaining({ moduleName: "duplicate", part }));
	});

	it("(h) ungated commands still run when every toggle is disabled", async () => {
		const admin = command("admin");
		const bot = createBot(
			options([
				{ name: "disabled", defaultEnabled: false },
				{ name: "admin", gated: false, commands: [admin] },
			]),
		);
		expect((await bot.settings.get(bot.registry.kernel, GUILD_A)).modules).toEqual({
			disabled: false,
		});
		await interact({ bot, kind: "slash", name: "admin" });
		expect(admin.dispatch).toHaveBeenCalledOnce();
	});

	it("(i) includes settings-only modules in declarations and toggles", async () => {
		const bot = createBot(
			options([{ name: "test", translations: CATALOG, settings: [DECLARATION] }]),
		);
		expect(bot.registry.get(DECLARATION.id)).toBe(DECLARATION);
		expect((await bot.settings.get(bot.registry.kernel, GUILD_A)).modules).toEqual({ test: true });
	});

	it("(j) uses the guild language for an unsupported member locale and preserves supported member preference", async () => {
		const failing = createCommand({
			name: "fail",
			description: "Fail",
			handler: async () => {
				throw new TypeError("failure");
			},
		});
		const bot = createBot(options([{ name: "test", commands: [failing] }]));
		await bot.settings.set(
			bot.registry.kernel,
			GUILD_A,
			{ locale: "fr" },
			{
				guildId: GUILD_A,
				userId: "admin",
				locale: "en",
			},
		);
		for (const locale of ["de", "en"]) {
			const replyLocale = locale === "de" ? "fr" : "en";
			const interaction = await interact({ bot, kind: "slash", name: "fail", locale });
			expect(interaction.reply).toHaveBeenCalledOnce();
			const payload = interaction.reply.mock.calls[0]?.[0];
			expect(payload).toMatchObject({
				embeds: [
					expect.objectContaining({
						data: expect.objectContaining({
							title: bot.translator.translate(replyLocale, CORE_MESSAGES.presenterErrorTitle),
						}),
					}),
				],
			});
		}
	});

	it("(k) uses custom presenter and locale resolver factory", async () => {
		const embed = new EmbedBuilder().setDescription("custom");
		const presenter = {
			confirmation: vi.fn(() => embed),
			warning: vi.fn(() => embed),
			error: vi.fn(() => embed),
			denial: vi.fn(() => embed),
			systemError: vi.fn(() => embed),
		};
		const localeResolver = vi.fn(() => createFixedLocaleResolver("fr"));
		const input = options([
			{
				name: "test",
				commands: [
					createCommand({
						name: "confirm",
						description: "Confirm",
						handler: async (ctx) => {
							await ctx.confirm("done");
						},
					}),
				],
			},
		]);
		const bot = createBot({ ...input, adapters: { ...input.adapters, presenter, localeResolver } });
		const interaction = await interact({ bot, kind: "slash", name: "confirm" });
		expect(localeResolver).toHaveBeenCalledWith(
			expect.objectContaining({ settings: bot.settings }),
		);
		expect(presenter.confirmation).toHaveBeenCalledWith("done", "fr");
		expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: [embed] }));
	});

	it("(l) exposes all services and awaits login without returning the token", async () => {
		const input = options([]);
		const clock = fixedClock(new Date("2026-01-01T00:00:00Z"));
		const bot = createBot({ ...input, adapters: { ...input.adapters, clock } });
		expect(bot).toMatchObject({ client: input.discord.client, logger: input.logger, clock });
		for (const key of ["translator", "registry", "settings", "gate", "presenter"]) {
			expect(bot).toHaveProperty(key);
		}
		expect(bot).not.toHaveProperty("state");
		expect(bot).not.toHaveProperty("stop");
		let resolveLogin: ((token: string) => void) | undefined;
		vi.mocked(input.discord.client.login).mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveLogin = resolve;
				}),
		);
		let completed = false;
		const starting = bot.start("secret").then((result) => {
			completed = true;
			return result;
		});
		await Promise.resolve();
		expect(completed).toBe(false);
		resolveLogin?.("secret");
		expect(await starting).toBeUndefined();
		expect(input.discord.client.login).toHaveBeenCalledWith("secret");
	});

	it("(n) gates command, component and event handlers per guild", async () => {
		const slash = command("test");
		const button = component("test");
		const execute = vi.fn(async () => undefined);
		const bot = createBot(
			options([
				{
					name: "test",
					commands: [slash],
					components: [button],
					events: [createEvent({ name: Events.MessageCreate, execute })],
				},
			]),
		);
		await bot.settings.set(
			bot.registry.kernel,
			GUILD_A,
			{ modules: { test: false } },
			{
				guildId: GUILD_A,
				userId: "admin",
				locale: "en",
			},
		);
		for (const guildId of [GUILD_A, GUILD_B]) {
			await interact({ bot, kind: "slash", name: "test", guildId });
			await interact({ bot, kind: "button", name: "test", guildId });
			await dispatchClientEvent({
				client: bot.client,
				event: Events.MessageCreate,
				args: [{ guildId }],
			});
		}
		expect(slash.dispatch).toHaveBeenCalledOnce();
		expect(slash.dispatch.mock.calls[0]).toEqual([
			expect.objectContaining({ guildId: GUILD_B }),
			expect.anything(),
		]);
		expect(button.handle).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ guildId: GUILD_B }),
			expect.anything(),
		);
		expect(execute).toHaveBeenCalledExactlyOnceWith({ guildId: GUILD_B });
	});

	it("(o) registers and routes context menus", async () => {
		const menu = command("inspect");
		const bot = createBot(options([{ name: "test", contextMenuCommands: [menu] }]));
		await interact({ bot, kind: "contextMenu", name: "inspect" });
		expect(menu.dispatch).toHaveBeenCalledOnce();
	});

	it("(p) routes autocomplete through the shared command registry", async () => {
		const autocomplete = vi.fn(async () => undefined);
		const bot = createBot(
			options([
				{
					name: "test",
					build: () => ({
						commands: [{ ...command("search"), autocomplete }],
					}),
				},
			]),
		);
		await interact({ bot, kind: "autocomplete", name: "search" });
		expect(autocomplete).toHaveBeenCalledOnce();
	});

	it("(q) attaches exactly one interaction listener", () => {
		const bot = createBot(options([{ name: "one" }, { name: "two" }]));
		expect(bot.client.listenerCount(Events.InteractionCreate)).toBe(1);
	});

	it("exports registration errors as typed errors", () => {
		expect(new ModuleRegistrationError("test", new TypeError("cause"))).toBeInstanceOf(Error);
	});
});
