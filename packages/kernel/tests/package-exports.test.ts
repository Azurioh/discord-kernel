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
