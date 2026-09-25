import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

interface Manifest {
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly peerDependencies?: Readonly<Record<string, string>>;
}

const manifest: Manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

/**
 * The runtime dependencies the kernel may have (constitution I). `zod` is the one
 * allowed pure library. `node-cron` predates the constitution: it was already
 * shipped by 0.1.0 as the engine behind the `Scheduler`, and stays hidden
 * behind the kernel's own `ScheduledJob` type.
 */
const ALLOWED_DEPENDENCIES = ["node-cron", "zod"];

/** What the kernel exposes in its public types, so the consumer provides it. */
const ALLOWED_PEER_DEPENDENCIES = ["discord.js"];

/** Every module a declaration file pulls in: `from "x"`, `import("x")`, `require("x")`, `/// <reference types="x" />`. */
const SPECIFIER =
	/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+|<reference\s+types=)["']([^"']+)["']/gm;

function specifiersOf(source: string): string[] {
	return [...source.matchAll(SPECIFIER)].map((match) => match[1] ?? "");
}

/** Whether `specifier` names the package `name` or one of its subpaths. */
function namesPackage(specifier: string, name: string): boolean {
	return specifier === name || specifier.startsWith(`${name}/`);
}

function declarationFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true, recursive: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".d.ts"))
		.map((entry) => join(entry.parentPath, entry.name));
}

// CI runs the tests before `pnpm build`, so `dist` cannot be trusted to exist or
// to be fresh. The declarations are emitted here, from the same build config, into
// a directory this suite owns.
let outDir = "";
let declarations: ReadonlyMap<string, readonly string[]> = new Map();

beforeAll(() => {
	outDir = mkdtempSync(join(tmpdir(), "kernel-public-surface-"));
	const tsc = createRequire(join(ROOT, "package.json")).resolve("typescript/bin/tsc");
	execFileSync(
		process.execPath,
		[
			tsc,
			"-p",
			join(ROOT, "tsconfig.build.json"),
			"--emitDeclarationOnly",
			"--declarationMap",
			"false",
			"--sourceMap",
			"false",
			"--outDir",
			outDir,
		],
		{ cwd: ROOT, stdio: "pipe" },
	);
	declarations = new Map(
		declarationFiles(outDir).map((file) => [
			relative(outDir, file).split("\\").join("/"),
			specifiersOf(readFileSync(file, "utf8")),
		]),
	);
}, 120_000);

afterAll(() => {
	if (outDir !== "") rmSync(outDir, { recursive: true, force: true });
});

/** The emitted declaration files that import `name`, with the specifier they use. */
function importersOf(name: string, under = ""): string[] {
	return [...declarations]
		.filter(([file]) => file.startsWith(under))
		.flatMap(([file, specifiers]) =>
			specifiers
				.filter((specifier) => namesPackage(specifier, name))
				.map((specifier) => `${file} → ${specifier}`),
		);
}

describe("public surface of the settings feature (S14, FR-034, SC-008)", () => {
	it("emits the settings entry points", () => {
		expect(declarations.has("settings/index.d.ts")).toBe(true);
		expect(declarations.has("settings/testing/index.d.ts")).toBe(true);
	});

	it("keeps zod out of every emitted declaration under settings", () => {
		expect(importersOf("zod", "settings/")).toEqual([]);
	});

	it("keeps every regular dependency, zod included, out of every emitted declaration", () => {
		const leaks = Object.keys(manifest.dependencies ?? {}).flatMap((name) => importersOf(name));

		expect(leaks).toEqual([]);
	});

	it("depends at runtime on the allowed libraries only", () => {
		expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(ALLOWED_DEPENDENCIES);
	});

	it("asks the consumer for discord.js only", () => {
		expect(Object.keys(manifest.peerDependencies ?? {}).sort()).toEqual(ALLOWED_PEER_DEPENDENCIES);
	});
});
