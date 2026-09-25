import { join } from "node:path";
import { CommandRouter } from "@azurioh/discord-kernel/discord/command/router";
import { ComponentRouter } from "@azurioh/discord-kernel/discord/components/component-router";
import { EventRouter } from "@azurioh/discord-kernel/discord/events/event-router";
import { afterEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { createSandbox } from "@/bootstrap/create-sandbox";
import type { SandboxConfig } from "@/config";
import * as adminModule from "@/modules/admin/admin.module";
import { createPinoLogger } from "@/shared/logging/pino-logger";

vi.mock("@/modules/admin/admin.module", { spy: true });

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
	return spy.mock.calls.map(([commands, moduleName]) => ({
		names: [...commands].map(({ data }) => data.name),
		moduleName,
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
				{ names: ["ping", "roll", "pages"], moduleName: "basics" },
				{ names: ["config"], moduleName: "demo" },
			]),
		);
	});

	it("registers the admin commands without a module name, so they are never gated", () => {
		const spy = vi.spyOn(CommandRouter.prototype, "registerAll");

		const { client } = createSandbox(CONFIG, logger);
		void client.destroy();

		expect(registeredCommands(spy)).toContainEqual({ names: ["server"], moduleName: undefined });
	});

	it("registers the events and components of the gated modules with their module name", () => {
		const events = vi.spyOn(EventRouter.prototype, "registerAll");
		const components = vi.spyOn(ComponentRouter.prototype, "registerAll");

		const { client } = createSandbox(CONFIG, logger);
		void client.destroy();

		expect(events.mock.calls.map(([, moduleName]) => moduleName)).toEqual(["basics", "demo"]);
		expect(components.mock.calls.map(([, moduleName]) => moduleName)).toEqual(["basics", "demo"]);
	});

	it("lists /server among the commands to deploy", () => {
		const { client, commands } = createSandbox(CONFIG, logger);
		void client.destroy();

		expect(commands.get("server")).toBeDefined();
	});

	it("offers a toggle only for the modules the gate can disable", () => {
		const { client } = createSandbox(CONFIG, logger);
		void client.destroy();

		const deps = vi.mocked(adminModule.createAdminModule).mock.lastCall?.[0];
		const spec = deps?.kernelSettings().fields.modules.spec;
		expect(spec?.kind === "toggles" ? spec.keys : undefined).toEqual(["basics", "demo"]);
	});
});
