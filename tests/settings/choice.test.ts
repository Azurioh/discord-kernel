import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Choice } from "@/settings/choice";

const SETTINGS_DIR = join(__dirname, "..", "..", "src", "settings");

/**
 * Matches a static import/export, a dynamic `import()` or a `require()` of
 * discord.js or any `@discordjs/*` package.
 */
const VENDOR_IMPORT =
	/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'](?:discord\.js|@discordjs\/[^"']+)(?:\/[^"']*)?["']/;

/** Every TypeScript source under `src/settings/`, read from disk so new files are covered too. */
function settingsSources(): string[] {
	return readdirSync(SETTINGS_DIR, { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".ts"))
		.map((file) => join(SETTINGS_DIR, file));
}

describe("settings core stays vendor-free", () => {
	it("scans at least the Choice module", () => {
		expect(settingsSources()).toContain(join(SETTINGS_DIR, "choice.ts"));
	});

	it("has no file importing discord.js", () => {
		const offenders = settingsSources().filter((file) =>
			VENDOR_IMPORT.test(readFileSync(file, "utf8")),
		);

		expect(offenders).toEqual([]);
	});
});

describe("Choice", () => {
	it("has the shape Discord expects for a choice", () => {
		expectTypeOf<Choice>().toEqualTypeOf<{
			readonly name: string;
			readonly value: string | number;
		}>();
	});
});
