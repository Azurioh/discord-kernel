import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KERNEL_SETTINGS_ID, kernelSettings } from "@azurioh/discord-kernel/settings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSandbox, type Sandbox } from "@/bootstrap/create-sandbox";
import type { SandboxConfig } from "@/config";
import { createPinoLogger } from "@/shared/logging/pino-logger";
import { createSqliteSettingsStore } from "@/shared/settings/sqlite/sqlite-settings-store";

/**
 * End to end through the real composition root: SQLite store, settings
 * service, module gate, locale resolver and command router, with only the
 * Discord interaction faked. Checks the spec's acceptance scenarios S15
 * (a disabled module answers "disabled" on that guild only), S16 (turning it
 * back on), S17 (reply language order) and that /server stays reachable.
 */

const GUILD = "100000000000000001";
const OTHER_GUILD = "100000000000000002";
const ADMIN = "200000000000000001";

const logger = createPinoLogger("test", { write: () => undefined });

interface Sent {
	readonly description: string | undefined;
	readonly title: string | undefined;
}

/** A chat-input interaction as the router reads it; records what the bot sends. */
function slash(params: {
	name: string;
	guildId: string | null;
	locale?: string;
	guildLocale?: string | null;
}) {
	const sent: Sent[] = [];
	const record = async (payload: {
		embeds?: { data: { description?: string; title?: string } }[];
	}) => {
		for (const embed of payload.embeds ?? []) {
			sent.push({ description: embed.data.description, title: embed.data.title });
		}
	};
	const interaction = {
		commandName: params.name,
		commandType: 1,
		guildId: params.guildId,
		inGuild: () => params.guildId !== null,
		locale: params.locale ?? "en-US",
		guildLocale: params.guildLocale ?? null,
		user: { id: ADMIN },
		member: { permissions: { has: () => true } },
		memberPermissions: { has: () => true, missing: () => [] },
		deferred: false,
		replied: false,
		client: { ws: { ping: 42 } },
		options: {
			getSubcommand: () => null,
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

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), "sandbox-e2e-"));
		config = {
			token: "token",
			clientId: "client",
			devGuildId: GUILD,
			settingsStore: { adapter: "sqlite", file: join(directory, "settings.sqlite") },
		};
		sandbox = createSandbox(config, logger);
	});

	afterEach(async () => {
		await sandbox.client.destroy();
		rmSync(directory, { recursive: true, force: true });
	});

	/** Write the guild's kernel settings straight into the store the sandbox reads. */
	async function storeKernel(guildId: string, values: Record<string, unknown>) {
		const store = createSqliteSettingsStore(join(directory, "settings.sqlite"));
		const current = await store.read(guildId, KERNEL_SETTINGS_ID);
		await store.write(
			{
				guildId,
				moduleId: KERNEL_SETTINGS_ID,
				version: 1,
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
});
