import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ConflictError } from "@azurioh/discord-kernel/errors/business-error";
import { runSettingsStoreContract } from "@azurioh/discord-kernel/settings/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SQLITE_MIGRATIONS } from "@/shared/settings/sqlite/sqlite-migrations.constant";
import { createSqliteSettingsStore } from "@/shared/settings/sqlite/sqlite-settings-store";
import { CorruptSettingsRowError } from "@/shared/settings/sqlite/sqlite-settings-store-errors";

let directory: string;
let fileCount = 0;

/** A database file of its own under this run's temporary directory. */
function freshFile(): string {
	fileCount += 1;
	return join(directory, "nested", `settings-${fileCount}.sqlite`);
}

beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), "sandbox-sqlite-settings-"));
});

afterAll(async () => {
	await rm(directory, { recursive: true, force: true });
});

const RECORD = {
	guildId: "1",
	moduleId: "demo",
	version: 1,
	revision: 1,
	values: { mode: "strict" },
	updatedAt: "2026-01-01T00:00:00.000Z",
};

runSettingsStoreContract(() => createSqliteSettingsStore(freshFile()), { describe, it, expect });

describe("createSqliteSettingsStore", () => {
	it("keeps records across store instances over the same file", async () => {
		const file = freshFile();

		await createSqliteSettingsStore(file).write(RECORD, { expectedRevision: null });

		expect(await createSqliteSettingsStore(file).read("1", "demo")).toEqual(RECORD);
	});

	it("rejects a stale write from another store over the same file", async () => {
		const file = freshFile();
		const first = createSqliteSettingsStore(file);
		const second = createSqliteSettingsStore(file);
		await first.write(RECORD, { expectedRevision: null });
		await first.write({ ...RECORD, revision: 2 }, { expectedRevision: 1 });

		await expect(
			second.write({ ...RECORD, revision: 2, values: {} }, { expectedRevision: 1 }),
		).rejects.toBeInstanceOf(ConflictError);
		expect(await second.read("1", "demo")).toEqual({ ...RECORD, revision: 2 });
	});

	it("records the schema version it migrated to", () => {
		const file = freshFile();
		createSqliteSettingsStore(file);

		const database = new DatabaseSync(file);
		const { user_version } = database.prepare("PRAGMA user_version").get() ?? {};
		database.close();

		expect(user_version).toBe(SQLITE_MIGRATIONS.length);
	});

	it("refuses a row whose values are not a JSON object", async () => {
		const file = freshFile();
		const store = createSqliteSettingsStore(file);
		await store.write(RECORD, { expectedRevision: null });
		const database = new DatabaseSync(file);
		database.exec("UPDATE module_settings SET values_json = '[1]'");
		database.close();

		await expect(store.read("1", "demo")).rejects.toBeInstanceOf(CorruptSettingsRowError);
	});
});
