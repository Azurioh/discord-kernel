import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface Manifest {
	readonly dependencies?: Readonly<Record<string, string>>;
}

const manifest: Manifest = JSON.parse(
	readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"),
);

/**
 * The runtime dependencies the kernel may have. Constitution Principle I, 2.1.0:
 * `zod` is the allowed pure library; `node-cron` predates the constitution (the
 * engine behind the `Scheduler`, hidden behind the kernel's own `ScheduledJob`).
 */
const ALLOWED_RUNTIME_DEPENDENCIES = ["node-cron", "zod"];

/** The runtime dependencies of `candidate` that the constitution does not allow. */
function forbiddenDependencies(candidate: Manifest): string[] {
	return Object.keys(candidate.dependencies ?? {}).filter(
		(name) => !ALLOWED_RUNTIME_DEPENDENCIES.includes(name),
	);
}

describe("kernel runtime dependencies (FR-027, constitution I)", () => {
	it("depends at runtime on the allowed libraries only", () => {
		expect(forbiddenDependencies(manifest)).toEqual([]);
	});

	it("keeps both allowed libraries, so a dropped one is a reviewed change", () => {
		expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(ALLOWED_RUNTIME_DEPENDENCIES);
	});

	it("rejects a manifest with any other runtime dependency", () => {
		const extended: Manifest = {
			dependencies: { ...manifest.dependencies, "left-pad": "1.3.0" },
		};

		expect(forbiddenDependencies(extended)).toEqual(["left-pad"]);
	});
});
