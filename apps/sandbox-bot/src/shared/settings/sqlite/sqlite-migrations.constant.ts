/**
 * The schema of the SQLite settings store, one step per entry: entry `i` takes
 * the database from `PRAGMA user_version = i` to `i + 1`. Append a step to
 * change the schema; never edit a step a database may already have run.
 */
export const SQLITE_MIGRATIONS: readonly string[] = [
	`CREATE TABLE module_settings (
		guild_id TEXT NOT NULL,
		module_id TEXT NOT NULL,
		revision INTEGER NOT NULL,
		version INTEGER NOT NULL,
		values_json TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		updated_by TEXT,
		PRIMARY KEY (guild_id, module_id)
	) STRICT`,
];
