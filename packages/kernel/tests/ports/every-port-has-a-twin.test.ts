import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInMemoryAuthorizer } from "@/authz/in-memory-authorizer";
import { fixedClock } from "@/clock";
import { createDefaultPresenter } from "@/discord/default-presenter";
import { createInMemoryChannelExporter } from "@/discord/in-memory-channel-exporter";
import { createFixedLocaleResolver } from "@/discord/interaction/fixed-locale-resolver";
import { createInMemoryLogger } from "@/in-memory-logger";
import { createInMemoryDatabase } from "@/persistence/in-memory-database";
import { createInMemoryMigrationRunner } from "@/persistence/in-memory-migration-runner";
import { createInMemoryScheduler } from "@/scheduler/in-memory-scheduler";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import { createInMemoryModuleGate } from "@/settings/system/in-memory-module-gate";

const SRC = join(__dirname, "..", "..", "src");

/** A JSDoc block directly followed by an exported interface: its text and the interface name. */
const DOCUMENTED_INTERFACE = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*export interface (\w+)/g;

/** Every interface under `src` whose JSDoc carries the `@port` tag. */
function taggedPorts(): string[] {
	return readdirSync(SRC, { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".ts"))
		.flatMap((file) =>
			[...readFileSync(join(SRC, file), "utf8").matchAll(DOCUMENTED_INTERFACE)]
				.filter((match) => /@port\b/.test(match[1] ?? ""))
				.map((match) => match[2] ?? ""),
		)
		.sort();
}

/**
 * The in-memory twin of each port (research R15), imported from the module its
 * public subpath exposes. A port without a row here fails the suite.
 */
const PORT_TWINS: Readonly<Record<string, unknown>> = {
	Authorizer: createInMemoryAuthorizer,
	ChannelExporter: createInMemoryChannelExporter,
	Clock: fixedClock,
	DatabaseConnection: createInMemoryDatabase,
	GuildDirectory: createInMemoryGuildDirectory,
	LocaleResolver: createFixedLocaleResolver,
	Logger: createInMemoryLogger,
	MigrationRunner: createInMemoryMigrationRunner,
	ModuleGate: createInMemoryModuleGate,
	Presenter: createDefaultPresenter,
	Scheduler: createInMemoryScheduler,
	SettingsChangedNotifier: createInProcessNotifier,
	SettingsStore: createInMemorySettingsStore,
};

describe("every port has an in-memory twin (FR-026a, SC-005)", () => {
	it("finds the tagged ports", () => {
		expect(taggedPorts()).toEqual(expect.arrayContaining(["Logger", "SettingsStore"]));
	});

	it("lists a twin for every tagged port", () => {
		expect(taggedPorts().filter((port) => !(port in PORT_TWINS))).toEqual([]);
	});

	it("lists no twin for an interface that is not a tagged port", () => {
		const ports = taggedPorts();

		expect(Object.keys(PORT_TWINS).filter((port) => !ports.includes(port))).toEqual([]);
	});

	it("points every row at a factory", () => {
		for (const [port, twin] of Object.entries(PORT_TWINS)) {
			expect(typeof twin, port).toBe("function");
		}
	});
});
