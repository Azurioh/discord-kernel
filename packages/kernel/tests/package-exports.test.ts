import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

interface ExportTarget {
	readonly types: string;
	readonly default: string;
}

const packageExports: Readonly<Record<string, string | ExportTarget>> = JSON.parse(
	readFileSync(join(ROOT, "package.json"), "utf8"),
).exports;

/** Every subpath that points into the build, with its two targets. */
const moduleExports = Object.entries(packageExports).filter(
	(entry): entry is [string, ExportTarget] => typeof entry[1] !== "string",
);

/** The source a build target is compiled from: `./dist/a/b.js` → `src/a/b.ts`. */
function sourceOf(target: string): string {
	return join(ROOT, target.replace(/^\.\/dist\//, "src/").replace(/(\.d)?\.ts$|\.js$/, ".ts"));
}

describe("package exports", () => {
	it("publishes no wildcard subpath", () => {
		expect(Object.keys(packageExports).filter((key) => key.includes("*"))).toEqual([]);
	});

	it("points every subpath at the declaration and the script of one existing source", () => {
		for (const [key, target] of moduleExports) {
			expect(target.types, key).toMatch(/^\.\/dist\/.+\.d\.ts$/);
			expect(target.default, key).toMatch(/^\.\/dist\/.+\.js$/);
			expect(sourceOf(target.types), key).toBe(sourceOf(target.default));
			expect(existsSync(sourceOf(target.default)), key).toBe(true);
		}
	});

	it("exposes the settings feature through its two entry points only", () => {
		const settingsKeys = Object.keys(packageExports).filter((key) => key.startsWith("./settings"));

		expect(settingsKeys.sort()).toEqual(["./settings", "./settings/testing"]);
		expect(packageExports["./settings"]).toEqual({
			types: "./dist/settings/index.d.ts",
			default: "./dist/settings/index.js",
		});
		expect(packageExports["./settings/testing"]).toEqual({
			types: "./dist/settings/testing/index.d.ts",
			default: "./dist/settings/testing/index.js",
		});
	});
});

describe("bot building blocks remain public (T030 m, FR-007)", () => {
	it.each([
		"bot/bot-errors",
		"bot/lifecycle-step",
		"bot/lifecycle",
		"bot/lifecycle-dispatcher",
		"bot/module-status",
		"bot/process-like",
		"bot/stop-report",
		"bot/in-memory-process",
		"bot/process-handlers",
		"discord/module-availability",
		"discord/in-memory-module-availability",
		"discord/settings/module-unavailable-embed",

		"bot/assemble-modules",
		"bot/create-bot",
		"module/module-context",
		"module/module",
		"clock",
		"logger",
		"i18n/catalog",
		"i18n/translator",
		"i18n/locale",
		"discord/i18n",
		"discord/default-presenter",
		"discord/command/router",
		"discord/command/autocomplete-dispatcher",
		"discord/command/command-deploy-rest",
		"discord/command/in-memory-deploy-rest",
		"discord/components/component-router",
		"discord/events/event-router",
		"discord/interaction/interaction-router",
		"discord/settings/discord-guild-directory",
		"discord/settings/guild-locale-resolver",
	])("keeps ./%s importable at its own entry point", (subpath) => {
		expect(packageExports[`./${subpath}`]).toEqual({
			types: `./dist/${subpath}.d.ts`,
			default: `./dist/${subpath}.js`,
		});
	});

	it("keeps settings composition and its contract suite on the two settings entry points", () => {
		const settings = readFileSync(join(ROOT, "src/settings/index.ts"), "utf8");
		for (const symbol of [
			"createSettingsRegistry",
			"createSettingsService",
			"createModuleGate",
			"createInProcessNotifier",
			"SETTINGS_CATALOG",
		]) {
			expect(settings).toContain(symbol);
		}
		expect(readFileSync(join(ROOT, "src/settings/testing/index.ts"), "utf8")).toContain(
			"runSettingsStoreContract",
		);
	});
});
