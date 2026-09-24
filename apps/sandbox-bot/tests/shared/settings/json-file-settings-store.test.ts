import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSettingsStoreContract } from "@azurioh/discord-kernel/settings/testing";
import { afterAll, describe, expect, it } from "vitest";
import { createJsonFileSettingsStore } from "@/shared/settings/json-file-settings-store";
import { CorruptSettingsFileError } from "@/shared/settings/json-file-settings-store-errors";

const directories: string[] = [];

/** A store over a file in a fresh directory, so no two tests share state. */
async function createStore() {
	const directory = await mkdtemp(join(tmpdir(), "sandbox-settings-"));
	directories.push(directory);
	return {
		directory,
		store: createJsonFileSettingsStore(join(directory, "nested", "settings.json")),
	};
}

afterAll(async () => {
	await Promise.all(
		directories.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

runSettingsStoreContract(async () => (await createStore()).store, { describe, it, expect });

describe("createJsonFileSettingsStore", () => {
	it("keeps records across store instances over the same file", async () => {
		const { directory } = await createStore();
		const file = join(directory, "settings.json");
		const record = {
			guildId: "1",
			moduleId: "demo",
			version: 1,
			revision: 1,
			values: { mode: "strict" },
			updatedAt: "2026-01-01T00:00:00.000Z",
		};

		await createJsonFileSettingsStore(file).write(record, { expectedRevision: null });

		expect(await createJsonFileSettingsStore(file).read("1", "demo")).toEqual(record);
	});

	it("leaves no temporary file behind", async () => {
		const { directory } = await createStore();
		const store = createJsonFileSettingsStore(join(directory, "settings.json"));

		await store.write(
			{
				guildId: "1",
				moduleId: "demo",
				version: 1,
				revision: 1,
				values: {},
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
			{ expectedRevision: null },
		);

		expect(await readdir(directory)).toEqual(["settings.json"]);
	});

	it("refuses a file that does not hold an object of records", async () => {
		const { directory } = await createStore();
		const file = join(directory, "settings.json");
		await writeFile(file, "[]", "utf8");

		await expect(createJsonFileSettingsStore(file).read("1", "demo")).rejects.toBeInstanceOf(
			CorruptSettingsFileError,
		);
	});
});
