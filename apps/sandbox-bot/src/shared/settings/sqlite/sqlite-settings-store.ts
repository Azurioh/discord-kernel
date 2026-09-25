import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { ConflictError } from "@azurioh/discord-kernel/errors/business-error";
import type { SettingsStore, StoredSettings } from "@azurioh/discord-kernel/settings";
import { SQLITE_MIGRATIONS } from "@/shared/settings/sqlite/sqlite-migrations.constant";
import { CorruptSettingsRowError } from "@/shared/settings/sqlite/sqlite-settings-store-errors";

/** How long a writer waits for another process's lock before SQLite reports it busy. */
const BUSY_TIMEOUT_MS = 5000;

const SELECT_SQL = `SELECT revision, version, values_json, updated_at, updated_by
	FROM module_settings WHERE guild_id = ? AND module_id = ?`;

/** A create: lands only when no row holds the key yet. */
const INSERT_SQL = `INSERT INTO module_settings
	(guild_id, module_id, revision, version, values_json, updated_at, updated_by)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT (guild_id, module_id) DO NOTHING`;

/** An update: lands only when the row is still at the revision the caller read. */
const UPDATE_SQL = `UPDATE module_settings
	SET revision = ?, version = ?, values_json = ?, updated_at = ?, updated_by = ?
	WHERE guild_id = ? AND module_id = ? AND revision = ?`;

const DELETE_SQL = "DELETE FROM module_settings WHERE guild_id = ? AND module_id = ?";

/** Bring the schema up to the last step of {@link SQLITE_MIGRATIONS}, in one transaction. */
function migrate(database: DatabaseSync): void {
	database.exec("BEGIN IMMEDIATE");
	try {
		const current = database.prepare("PRAGMA user_version").get()?.user_version;
		const from = typeof current === "number" ? current : 0;
		for (const [index, step] of SQLITE_MIGRATIONS.entries()) {
			if (index >= from) {
				database.exec(step);
			}
		}
		// PRAGMA takes no bound parameter; the value is a length, not input.
		database.exec(`PRAGMA user_version = ${SQLITE_MIGRATIONS.length}`);
		database.exec("COMMIT");
	} catch (error) {
		database.exec("ROLLBACK");
		throw error;
	}
}

function isValues(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Turn a row back into the record that was written, checking every column,
 * so a hand-edited database fails loudly instead of feeding the service junk.
 */
function toRecord(
	guildId: string,
	moduleId: string,
	row: Record<string, SQLOutputValue>,
): StoredSettings {
	const { revision, version, values_json, updated_at, updated_by } = row;
	if (
		typeof revision !== "number" ||
		typeof version !== "number" ||
		typeof values_json !== "string" ||
		typeof updated_at !== "string" ||
		(updated_by !== null && typeof updated_by !== "string")
	) {
		throw new CorruptSettingsRowError(guildId, moduleId);
	}
	const values: unknown = JSON.parse(values_json);
	if (!isValues(values)) {
		throw new CorruptSettingsRowError(guildId, moduleId);
	}
	return {
		guildId,
		moduleId,
		version,
		revision,
		values,
		updatedAt: updated_at,
		...(updated_by === null ? {} : { updatedBy: updated_by }),
	};
}

/**
 * A {@link SettingsStore} over one SQLite database, through Node's built-in
 * `node:sqlite`. Each record is a row of `module_settings` keyed by
 * `(guild_id, module_id)`; several processes may share the file.
 *
 * The compare-and-set is one conditional statement: an `INSERT ... ON CONFLICT
 * DO NOTHING` for a create, an `UPDATE ... WHERE revision = ?` for an update.
 * It runs in an immediate transaction, and a statement that changed no row
 * means the revision moved: the transaction is rolled back and the write fails
 * with `ConflictError`.
 *
 * @param filePath - the database file; created with its directory and schema on first use.
 * @returns the store.
 */
export function createSqliteSettingsStore(filePath: string): SettingsStore {
	mkdirSync(dirname(filePath), { recursive: true });
	const database = new DatabaseSync(filePath, { timeout: BUSY_TIMEOUT_MS });
	database.exec("PRAGMA journal_mode = WAL");
	migrate(database);
	const select = database.prepare(SELECT_SQL);
	const insert = database.prepare(INSERT_SQL);
	const update = database.prepare(UPDATE_SQL);
	const remove = database.prepare(DELETE_SQL);

	return {
		async read(guildId, moduleId) {
			const row = select.get(guildId, moduleId);
			return row === undefined ? null : toRecord(guildId, moduleId, row);
		},

		async write(record, { expectedRevision }) {
			const valuesJson = JSON.stringify(record.values);
			const updatedBy = record.updatedBy ?? null;
			database.exec("BEGIN IMMEDIATE");
			try {
				const { changes } =
					expectedRevision === null
						? insert.run(
								record.guildId,
								record.moduleId,
								record.revision,
								record.version,
								valuesJson,
								record.updatedAt,
								updatedBy,
							)
						: update.run(
								record.revision,
								record.version,
								valuesJson,
								record.updatedAt,
								updatedBy,
								record.guildId,
								record.moduleId,
								expectedRevision,
							);
				if (changes === 0) {
					throw new ConflictError(
						`Settings ${record.guildId}/${record.moduleId} are not at revision ${expectedRevision}`,
					);
				}
				database.exec("COMMIT");
			} catch (error) {
				database.exec("ROLLBACK");
				throw error;
			}
		},

		async delete(guildId, moduleId) {
			remove.run(guildId, moduleId);
		},
	};
}
