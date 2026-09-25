import { EmbedBuilder, MessageFlags, PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { fixedClock } from "@/clock";
import { createCommand } from "@/discord/command/create-command";
import { allOf } from "@/discord/command/guard";
import type { CommandRuntime } from "@/discord/command/types";
import { openToAnyone } from "@/discord/components/component-access";
import { ComponentRouter } from "@/discord/components/component-router";
import { CORE_CATALOG, CORE_MESSAGES } from "@/discord/i18n";
import type { Presenter } from "@/discord/presenter";
import { requireConfigured } from "@/discord/settings/require-configured";
import { TranslationRegistry } from "@/i18n/catalog";
import { createTranslator } from "@/i18n/translator";
import { defineSettings } from "@/settings/define-settings";
import { field } from "@/settings/fields/builders";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import { SETTINGS_CATALOG, SETTINGS_MESSAGES } from "@/settings/messages";
import { createSettingsRegistry } from "@/settings/registry";
import { createSettingsService } from "@/settings/settings-service";
import { createFakeLocaleResolver } from "../../support/fake-locale-resolver";
import { createFakeLogger } from "../../support/fake-logger";

const GUILD = "100000000000000001";
const CHANNEL = "200000000000000001";
const ADMIN = "400000000000000001";

const tickets = defineSettings({
	id: "tickets",
	version: 1,
	labels: { title: "tickets.title" },
	fields: {
		channel: field.channel({ label: "tickets.channel", types: ["text"], required: true }),
		staff: field.role({ label: "tickets.staff", required: true }),
		limit: field.integer({ label: "tickets.limit", required: true, default: 3 }),
	},
});

const TICKETS_CATALOG = {
	"tickets.title": { en: "Tickets", fr: "Tickets" },
	"tickets.channel": { en: "Ticket channel", fr: "Salon des tickets" },
	"tickets.staff": { en: "Staff role", fr: "Rôle du staff" },
	"tickets.limit": { en: "Limit", fr: "Limite" },
};

function setup() {
	const translations = new TranslationRegistry();
	translations.register(CORE_CATALOG);
	translations.register(SETTINGS_CATALOG);
	translations.register(TICKETS_CATALOG);
	const logger = createFakeLogger();
	const translator = createTranslator(translations, { defaultLocale: "en", logger });
	const registry = createSettingsRegistry({ declarations: [tickets], translations });
	const store = createInMemorySettingsStore();
	const service = createSettingsService({
		registry,
		store,
		guilds: createInMemoryGuildDirectory({
			[GUILD]: {
				channels: [{ id: CHANNEL, name: "tickets", kind: "text" }],
				roles: [{ id: "300000000000000001", name: "staff" }],
			},
		}),
		notifier: createInProcessNotifier(logger),
		translator,
		clock: fixedClock(new Date("2026-01-01T00:00:00.000Z")),
		logger,
	});
	const presenter = {
		denial: vi.fn((message: string) => new EmbedBuilder().setDescription(message)),
		error: vi.fn(() => new EmbedBuilder()),
		warning: vi.fn(() => new EmbedBuilder()),
		confirmation: vi.fn(() => new EmbedBuilder()),
		systemError: vi.fn(() => new EmbedBuilder()),
	};
	const runtime = {
		presenter: presenter as unknown as Presenter,
		logger,
		translator,
		localeResolver: createFakeLocaleResolver("fr"),
	} satisfies CommandRuntime;
	const guard = requireConfigured(tickets, service);
	/** Set every required field, as an administrator would. */
	const configure = () =>
		service.set(
			tickets,
			GUILD,
			{ channel: CHANNEL, staff: "300000000000000001" },
			{ guildId: GUILD, userId: ADMIN, locale: "en" },
		);
	return { service, store, translator, runtime, presenter, guard, configure };
}

/** What the guard and the routers read of an interaction. */
function fakeInteraction(params: { guildId?: string | null; admin?: boolean } = {}) {
	const guildId = params.guildId === undefined ? GUILD : params.guildId;
	const held = params.admin ? PermissionFlagsBits.ManageGuild : PermissionFlagsBits.SendMessages;
	return {
		commandName: "ticket",
		customId: "ticket:open",
		id: "900000000000000001",
		guildId,
		locale: "de",
		guildLocale: "en-US",
		user: { id: ADMIN },
		memberPermissions: guildId === null ? null : new PermissionsBitField(held),
		deferred: false,
		replied: false,
		inGuild: () => guildId !== null,
		isButton: () => true,
		isAnySelectMenu: () => false,
		isModalSubmit: () => false,
		reply: vi.fn(async () => undefined),
		editReply: vi.fn(async () => undefined),
		followUp: vi.fn(async () => undefined),
		deferReply: vi.fn(async () => undefined),
	};
}

describe("requireConfigured (FR-041, S18)", () => {
	it("passes once every required field without default is set", async () => {
		const { guard, runtime, configure } = setup();
		await configure();

		await expect(guard.check(fakeInteraction() as never, runtime)).resolves.toStrictEqual({
			ok: true,
		});
	});

	it("tells a member who cannot configure the server only that the module is not configured", async () => {
		const { guard, runtime } = setup();

		const result = await guard.check(fakeInteraction() as never, runtime);

		expect(result).toStrictEqual({
			ok: false,
			message: { key: SETTINGS_MESSAGES.moduleNotConfigured },
		});
	});

	it("names the missing settings, translated in the reply language, to a member with Manage Server", async () => {
		const { guard, runtime } = setup();

		const result = await guard.check(fakeInteraction({ admin: true }) as never, runtime);

		expect(result).toStrictEqual({
			ok: false,
			message:
				"Cette fonctionnalité n'est pas encore configurée sur ce serveur : " +
				"un administrateur doit d'abord la configurer. " +
				"Paramètres manquants : Salon des tickets, Rôle du staff.",
		});
		expect(runtime.localeResolver.resolve).toHaveBeenCalled();
	});

	it("names no field when called without the runtime to translate them", async () => {
		const { guard } = setup();

		const result = await guard.check(fakeInteraction({ admin: true }) as never);

		expect(result).toStrictEqual({
			ok: false,
			message: { key: SETTINGS_MESSAGES.moduleNotConfigured },
		});
	});

	it("passes right after the missing value is set, with the same guard and no restart", async () => {
		const { guard, runtime, configure } = setup();
		const interaction = fakeInteraction();
		expect((await guard.check(interaction as never, runtime)).ok).toBe(false);

		await configure();

		expect((await guard.check(interaction as never, runtime)).ok).toBe(true);
	});

	it("denies outside a guild, like guildOnlyGuard, without reading any setting", async () => {
		const { guard, runtime, store } = setup();
		const read = vi.spyOn(store, "read");

		const result = await guard.check(fakeInteraction({ guildId: null }) as never, runtime);

		expect(result).toStrictEqual({ ok: false, message: { key: CORE_MESSAGES.guardGuildOnly } });
		expect(read).not.toHaveBeenCalled();
	});

	it("blocks a command's handler with the denial, until the module is configured", async () => {
		const { guard, runtime, presenter, configure } = setup();
		const handler = vi.fn(async () => undefined);
		const command = createCommand({
			name: "ticket",
			description: "Open a ticket",
			guard: allOf(guard),
			handler,
		});

		const blocked = fakeInteraction({ admin: true });
		await command.dispatch(blocked as never, runtime);

		expect(handler).not.toHaveBeenCalled();
		expect(presenter.denial).toHaveBeenCalledWith(
			expect.stringContaining("Salon des tickets, Rôle du staff"),
			"fr",
		);
		expect(blocked.reply).toHaveBeenCalledWith(
			expect.objectContaining({ flags: MessageFlags.Ephemeral }),
		);

		await configure();
		await command.dispatch(fakeInteraction() as never, runtime);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("blocks a component handler the same way, until the module is configured", async () => {
		const { guard, runtime, presenter, configure } = setup();
		const handle = vi.fn();
		const router = new ComponentRouter(runtime).register({
			customId: "ticket",
			authorize: openToAnyone("members open their own ticket"),
			guard,
			handle,
		});

		const blocked = fakeInteraction();
		expect(await router.handle(blocked as never)).toBe(true);

		expect(handle).not.toHaveBeenCalled();
		expect(presenter.denial).toHaveBeenCalledWith(
			"Cette fonctionnalité n'est pas encore configurée sur ce serveur : " +
				"un administrateur doit d'abord la configurer.",
			"fr",
		);
		expect(blocked.reply).toHaveBeenCalledWith(
			expect.objectContaining({ flags: MessageFlags.Ephemeral }),
		);

		await configure();
		await router.handle(fakeInteraction() as never);

		expect(handle).toHaveBeenCalledTimes(1);
	});
});
