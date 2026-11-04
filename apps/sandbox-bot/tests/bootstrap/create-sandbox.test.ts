import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInMemoryDeployRest } from "@azurioh/discord-kernel/discord/command/in-memory-deploy-rest";
import { CommandRouter } from "@azurioh/discord-kernel/discord/command/router";
import { ComponentRouter } from "@azurioh/discord-kernel/discord/components/component-router";
import { EventRouter } from "@azurioh/discord-kernel/discord/events/event-router";
import { afterEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { createSandbox } from "@/bootstrap/create-sandbox";
import type { SandboxConfig } from "@/config";
import { demoSettings } from "@/modules/demo/settings/demo.settings";
import { createPinoLogger } from "@/shared/logging/pino-logger";

const logger = createPinoLogger("test", { write: () => undefined });

/** Nothing is written: the store only touches its file on the first settings write. */
const CONFIG: SandboxConfig = {
	token: "token",
	clientId: "client",
	devGuildId: "guild",
	settingsStore: { adapter: "json", file: join("never", "written.json") },
};

/** The command names each `registerAll` call carried, and the module it named. */
function registeredCommands(spy: MockInstance<CommandRouter["registerAll"]>) {
	return spy.mock.calls.map(([commands, moduleName, gated]) => ({
		names: [...commands].map(({ data }) => data.name),
		moduleName,
		gated,
	}));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("createSandbox", () => {
	it("registers each gated module's commands with its module name", () => {
		const spy = vi.spyOn(CommandRouter.prototype, "registerAll");

		const { client } = createSandbox(CONFIG, logger);
		void client.destroy();

		expect(registeredCommands(spy)).toEqual(
			expect.arrayContaining([
				{ names: ["ping", "roll", "pages"], moduleName: "basics", gated: true },
				{ names: ["config", "demo-log"], moduleName: "demo", gated: true },
			]),
		);
	});

	it("registers the admin commands with admin ownership and gating off", () => {
		const spy = vi.spyOn(CommandRouter.prototype, "registerAll");

		const { client } = createSandbox(CONFIG, logger);
		void client.destroy();

		expect(registeredCommands(spy)).toContainEqual({
			names: ["server"],
			moduleName: "admin",
			gated: false,
		});
	});

	it("registers the events and components of the gated modules with their module name", () => {
		const events = vi.spyOn(EventRouter.prototype, "registerAll");
		const components = vi.spyOn(ComponentRouter.prototype, "registerAll");

		const { client } = createSandbox(CONFIG, logger);
		void client.destroy();

		expect(events.mock.calls.map(([, moduleName]) => moduleName)).toEqual([
			"admin",
			"basics",
			"demo",
		]);
		expect(components.mock.calls.map(([, moduleName]) => moduleName)).toEqual([
			"admin",
			"basics",
			"demo",
		]);
	});

	it("deploys every command to the dev guild and prunes global commands without login", async () => {
		const bot = createSandbox(CONFIG, logger);
		const login = vi.spyOn(bot.client, "login");
		const rest = createInMemoryDeployRest();
		const count = await bot.deployCommands({
			token: CONFIG.token,
			clientId: CONFIG.clientId,
			rest,
		});
		expect(count).toBe(6);
		expect(rest.requests).toEqual([
			{ route: "/applications/client/commands", body: [] },
			{
				route: "/applications/client/guilds/guild/commands",
				body: expect.arrayContaining([
					expect.objectContaining({ name: "server" }),
					expect.objectContaining({ name: "ping" }),
					expect.objectContaining({ name: "roll" }),
					expect.objectContaining({ name: "pages" }),
					expect.objectContaining({ name: "config" }),
					expect.objectContaining({ name: "demo-log" }),
				]),
			},
		]);
		expect(login).not.toHaveBeenCalled();
		expect(bot.state).toBe("created");
		await bot.stop();
	});

	it("logs settings changes through the notifier adapter", async () => {
		const directory = mkdtempSync(join(tmpdir(), "sandbox-notifier-"));
		const info = vi.spyOn(logger, "info");
		const bot = createSandbox(
			{ ...CONFIG, settingsStore: { adapter: "json", file: join(directory, "settings.json") } },
			logger,
		);
		try {
			await bot.settings.set(
				demoSettings,
				"guild",
				{ warnLimit: 4 },
				{ guildId: "guild", userId: "admin", locale: "en" },
			);
			expect(info).toHaveBeenCalledWith(
				expect.objectContaining({ guildId: "guild", moduleId: demoSettings.id }),
				"Settings changed",
			);
		} finally {
			await bot.stop();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("awaits the pino adapter flush during shutdown", async () => {
		const flush = vi.spyOn(logger, "flush").mockResolvedValue();
		const bot = createSandbox(CONFIG, logger);
		await expect(bot.stop()).resolves.toMatchObject({ ok: true });
		expect(flush).toHaveBeenCalledOnce();
	});

	it("offers a toggle only for the modules the gate can disable", () => {
		const { client, registry } = createSandbox(CONFIG, logger);
		void client.destroy();

		const spec = registry.kernel.fields.modules.spec;
		expect(spec?.kind === "toggles" ? spec.keys : undefined).toEqual(["basics", "demo"]);
	});

	it("labels every module toggle with a translated name", () => {
		const { client, registry } = createSandbox(CONFIG, logger);
		void client.destroy();

		const spec = registry.kernel.fields.modules.spec;
		const labels = spec?.kind === "toggles" ? spec.keyLabels : undefined;
		expect(Object.keys(labels ?? {})).toEqual(["basics", "demo"]);
	});
});
