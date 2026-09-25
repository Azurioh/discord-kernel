import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	KERNEL_SETTINGS_ID,
	kernelSettings,
	type SettingsStore,
} from "@azurioh/discord-kernel/settings";
import { ChannelType, type Guild } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSandbox, type Sandbox } from "@/bootstrap/create-sandbox";
import type { SandboxConfig } from "@/config";
import { demoSettings } from "@/modules/demo/settings/demo.settings";
import { createPinoLogger } from "@/shared/logging/pino-logger";
import { createSqliteSettingsStore } from "@/shared/settings/sqlite/sqlite-settings-store";

/**
 * End to end through the real composition root: SQLite store, settings
 * service, module gate, locale resolver and command router, with only the
 * Discord interaction faked. Checks the spec's acceptance scenarios S15
 * (a disabled module answers "disabled" on that guild only), S16 (turning it
 * back on), S17 (reply language order), S18 (a command needing a required
 * setting is blocked until it is set), S11 (settings stored under an older
 * declaration version are migrated on read) and that /server stays reachable.
 */

const GUILD = "100000000000000001";
const OTHER_GUILD = "100000000000000002";
const ADMIN = "200000000000000001";
const LOG_CHANNEL = "300000000000000001";

const logger = createPinoLogger("test", { write: () => undefined });

interface Sent {
	readonly description: string | undefined;
	readonly title: string | undefined;
	/** Each embed field as `name: value`. */
	readonly fields: readonly string[];
}

/** A chat-input interaction as the router reads it; records what the bot sends. */
function slash(params: {
	name: string;
	/** The subcommand the member picked, for a command that has them. */
	subcommand?: string;
	guildId: string | null;
	locale?: string;
	guildLocale?: string | null;
	/** Whether the member holds Manage Server; every permission when omitted. */
	manageGuild?: boolean;
	/** The channel `client.channels.fetch` resolves to. */
	channel?: unknown;
}) {
	const sent: Sent[] = [];
	const record = async (payload: {
		embeds?: {
			data: {
				description?: string;
				title?: string;
				fields?: { name: string; value: string }[];
			};
		}[];
	}) => {
		for (const embed of payload.embeds ?? []) {
			const { description, title, fields = [] } = embed.data;
			sent.push({
				description,
				title,
				fields: fields.map(({ name, value }) => `${name}: ${value}`),
			});
		}
	};
	const manageGuild = params.manageGuild ?? true;
	const interaction = {
		commandName: params.name,
		commandType: 1,
		guildId: params.guildId,
		inGuild: () => params.guildId !== null,
		locale: params.locale ?? "en-US",
		guildLocale: params.guildLocale ?? null,
		user: { id: ADMIN },
		member: { permissions: { has: () => true } },
		memberPermissions: { has: () => manageGuild, missing: () => [] },
		deferred: false,
		replied: false,
		client: { ws: { ping: 42 }, channels: { fetch: async () => params.channel ?? null } },
		options: {
			getSubcommand: () => params.subcommand ?? null,
			getSubcommandGroup: () => null,
			get: () => null,
			data: [],
		},
		isChatInputCommand: () => true,
		isContextMenuCommand: () => false,
		isAutocomplete: () => false,
		isMessageComponent: () => false,
		isModalSubmit: () => false,
		reply: vi.fn(async (payload) => {
			interaction.replied = true;
			await record(payload);
		}),
		deferReply: vi.fn(async () => {
			interaction.deferred = true;
		}),
		editReply: vi.fn(record),
		followUp: vi.fn(record),
	};
	return { interaction, sent };
}

describe("sandbox, end to end", () => {
	let directory: string;
	let sandbox: Sandbox;
	let config: SandboxConfig;
	/** A second connection to the sandbox's SQLite file, as another process would open it. */
	let sqlite: SettingsStore;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), "sandbox-e2e-"));
		config = {
			token: "token",
			clientId: "client",
			devGuildId: GUILD,
			settingsStore: { adapter: "sqlite", file: join(directory, "settings.sqlite") },
		};
		sandbox = createSandbox(config, logger);
		sqlite = createSqliteSettingsStore(join(directory, "settings.sqlite"));
	});

	afterEach(async () => {
		await sandbox.client.destroy();
		rmSync(directory, { recursive: true, force: true });
	});

	/** Write the guild's kernel settings straight into the store the sandbox reads. */
	async function storeKernel(guildId: string, values: Record<string, unknown>) {
		await storeRaw({ guildId, moduleId: KERNEL_SETTINGS_ID, version: 1, values });
	}

	/** Write a record straight into the SQLite file the sandbox reads, bypassing the service. */
	async function storeRaw(params: {
		guildId: string;
		moduleId: string;
		version: number;
		values: Record<string, unknown>;
	}) {
		const { guildId, moduleId, version, values } = params;
		const current = await sqlite.read(guildId, moduleId);
		await sqlite.write(
			{
				guildId,
				moduleId,
				version,
				revision: (current?.revision ?? 0) + 1,
				values,
				updatedAt: "2026-01-01T00:00:00.000Z",
				updatedBy: ADMIN,
			},
			{ expectedRevision: current?.revision ?? null },
		);
	}

	async function run(params: Parameters<typeof slash>[0]) {
		const { interaction, sent } = slash(params);
		const claimed = await sandbox.commands.handle(interaction as never);
		return { claimed, sent, interaction };
	}

	it("runs /ping on a guild that never toggled anything (modules start enabled)", async () => {
		const { sent } = await run({ name: "ping", guildId: GUILD });

		expect(sent.map(({ description }) => description).join()).toMatch(/Pong/);
	});

	it("S15: answers 'disabled' for a disabled module, on that guild only", async () => {
		await storeKernel(GUILD, { modules: { basics: false, demo: true } });

		const off = await run({ name: "ping", guildId: GUILD });
		const other = await run({ name: "ping", guildId: OTHER_GUILD });

		expect(off.sent.map(({ description }) => description).join()).toMatch(
			/disabled on this server/i,
		);
		expect(off.interaction.reply).toHaveBeenCalledWith(
			expect.objectContaining({ flags: expect.anything() }),
		);
		expect(other.sent.map(({ description }) => description).join()).toMatch(/Pong/);
	});

	it("S16: runs the module again once an admin turns it back on, without a restart", async () => {
		const admin = { guildId: GUILD, userId: ADMIN, locale: "en" };
		const kernel = sandbox.settings;
		const declaration = kernelSettings([{ name: "basics" }, { name: "demo" }]);
		await kernel.set(declaration, GUILD, { modules: { basics: false, demo: true } }, admin);
		const off = await run({ name: "ping", guildId: GUILD });

		await kernel.set(declaration, GUILD, { modules: { basics: true, demo: true } }, admin);
		const on = await run({ name: "ping", guildId: GUILD });

		expect(off.sent.map(({ description }) => description).join()).toMatch(
			/disabled on this server/i,
		);
		expect(on.sent.map(({ description }) => description).join()).toMatch(/Pong/);
	});

	it("keeps /server reachable when every module is off", async () => {
		await storeKernel(GUILD, { modules: { basics: false, demo: false } });

		const { sent, interaction } = await run({ name: "server", guildId: GUILD });

		expect(sent.map(({ description }) => description ?? "").join()).not.toMatch(
			/disabled on this server/i,
		);
		expect(interaction.deferReply).toHaveBeenCalled();
	});

	it("S11: migrates demo settings stored under version 1 on the first read", async () => {
		await storeRaw({
			guildId: GUILD,
			moduleId: demoSettings.id,
			version: 1,
			values: { maxWarnings: 7, mode: "strict" },
		});

		const { sent } = await run({ name: "config", subcommand: "show", guildId: GUILD });
		const record = await sqlite.read(GUILD, demoSettings.id);

		expect(sent.flatMap(({ fields }) => fields)).toContain("Warning limit (warnLimit): 7");
		expect(record?.version).toBe(2);
		expect(record?.revision).toBe(2);
		expect(record?.values).toStrictEqual({ warnLimit: 7, mode: "strict" });
		expect(await sandbox.settings.get(demoSettings, GUILD)).toMatchObject({
			warnLimit: 7,
			mode: "strict",
		});
	});

	it("S17: replies in the member's client language when the bot supports it", async () => {
		await storeKernel(GUILD, { modules: { basics: false, demo: true }, locale: "en" });

		const { sent } = await run({ name: "ping", guildId: GUILD, locale: "fr" });

		expect(sent.map(({ description }) => description).join()).toMatch(/désactivé/i);
	});

	it("S17: falls back to the guild's language setting for an unsupported client language", async () => {
		await storeKernel(GUILD, { modules: { basics: false, demo: true }, locale: "fr" });

		const { sent } = await run({
			name: "ping",
			guildId: GUILD,
			locale: "de",
			guildLocale: "en-US",
		});

		expect(sent.map(({ description }) => description).join()).toMatch(/désactivé/i);
	});

	it("S17: then the guild's Discord language, then English", async () => {
		await storeKernel(GUILD, { modules: { basics: false, demo: true } });

		const discordFr = await run({ name: "ping", guildId: GUILD, locale: "de", guildLocale: "fr" });
		const nothing = await run({ name: "ping", guildId: GUILD, locale: "de", guildLocale: "ja" });

		expect(discordFr.sent.map(({ description }) => description).join()).toMatch(/désactivé/i);
		expect(nothing.sent.map(({ description }) => description).join()).toMatch(
			/disabled on this server/i,
		);
	});

	describe("S18: /demo-log needs the demo's required log channel", () => {
		/** A text channel the bot can post in, as `client.channels.fetch` returns it. */
		const logChannel = {
			id: LOG_CHANNEL,
			isSendable: () => true,
			send: vi.fn(async () => undefined),
		};

		/** Let the guild directory see the channel, so `service.set` accepts it. */
		function seedGuild() {
			const channels = new Map([
				[LOG_CHANNEL, { id: LOG_CHANNEL, name: "logs", type: ChannelType.GuildText }],
			]);
			sandbox.client.guilds.cache.set(GUILD, { channels: { cache: channels } } as unknown as Guild);
		}

		const described = (sent: readonly Sent[]) => sent.map(({ description }) => description).join();

		it("is blocked while unset, and only a Manage Server member reads the missing field", async () => {
			const admin = await run({ name: "demo-log", guildId: GUILD, channel: logChannel });
			const member = await run({
				name: "demo-log",
				guildId: GUILD,
				manageGuild: false,
				channel: logChannel,
			});

			expect(described(admin.sent)).toMatch(/not configured on this server/i);
			expect(described(admin.sent)).toMatch(/Missing settings: Log channel\./);
			expect(described(member.sent)).toMatch(/not configured on this server/i);
			expect(described(member.sent)).not.toMatch(/Log channel/);
			expect(logChannel.send).not.toHaveBeenCalled();
		});

		it("names the missing field in the reply language", async () => {
			const { sent } = await run({ name: "demo-log", guildId: GUILD, locale: "fr" });

			expect(described(sent)).toMatch(/Paramètres manquants : Salon de journalisation\./);
		});

		it("passes right after an admin sets the channel, without a restart", async () => {
			seedGuild();
			const blocked = await run({ name: "demo-log", guildId: GUILD, channel: logChannel });

			await sandbox.settings.set(
				demoSettings,
				GUILD,
				{ logChannel: LOG_CHANNEL },
				{ guildId: GUILD, userId: ADMIN, locale: "en" },
			);
			const passed = await run({ name: "demo-log", guildId: GUILD, channel: logChannel });

			expect(described(blocked.sent)).toMatch(/not configured/i);
			expect(described(passed.sent)).toMatch(/Posted a test message in <#300000000000000001>/);
			expect(logChannel.send).toHaveBeenCalledWith(expect.stringMatching(/log channel works/));
		});

		it("leaves /config usable while the module is not configured", async () => {
			const { interaction, sent } = await run({ name: "config", guildId: GUILD });

			expect(described(sent)).not.toMatch(/not configured/i);
			expect(interaction.reply.mock.calls.length + interaction.deferReply.mock.calls.length).toBe(
				1,
			);
		});
	});
});
