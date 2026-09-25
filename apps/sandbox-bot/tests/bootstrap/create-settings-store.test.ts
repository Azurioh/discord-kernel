import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSettingsStore } from "@/bootstrap/create-settings-store";

let directory: string;

beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), "sandbox-settings-store-"));
});

afterAll(async () => {
	await rm(directory, { recursive: true, force: true });
});

const RECORD = {
	guildId: "1",
	moduleId: "demo",
	version: 1,
	revision: 1,
	values: {},
	updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("createSettingsStore", () => {
	it("writes a JSON file for the json adapter", async () => {
		const file = join(directory, "json", "settings.json");

		await createSettingsStore({ adapter: "json", file }).write(RECORD, { expectedRevision: null });

		expect(await readdir(join(directory, "json"))).toEqual(["settings.json"]);
	});

	it("writes a SQLite database for the sqlite adapter", async () => {
		const file = join(directory, "sqlite", "settings.sqlite");

		await createSettingsStore({ adapter: "sqlite", file }).write(RECORD, {
			expectedRevision: null,
		});

		expect(await readdir(join(directory, "sqlite"))).toContain("settings.sqlite");
	});
});
