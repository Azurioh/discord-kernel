/**
 * The record a {@link SettingsStore} persists, one per `(guildId, moduleId)`.
 * Every field is JSON-serialisable, so an adapter may store the record as one
 * document, one row with a JSON column, or one hash; it must give back an equal
 * record (`updatedBy` absent stays absent).
 */
export interface StoredSettings {
	readonly guildId: string;
	/** Equals the declaration id of the module that owns these values. */
	readonly moduleId: string;
	/** Declaration version the values were written under. */
	readonly version: number;
	/**
	 * Starts at 1 on first write; +1 on each write. Used for optimistic
	 * concurrency. The caller computes it; the store persists it as given.
	 */
	readonly revision: number;
	/**
	 * Only declared, valid fields; unset fields are absent. Every value is plain
	 * JSON (string, finite number, boolean, `null`, arrays and objects of those),
	 * so `JSON.stringify` then `JSON.parse` gives back an equal object.
	 */
	readonly values: Readonly<Record<string, unknown>>;
	/** ISO-8601 timestamp from the `Clock` port. */
	readonly updatedAt: string;
	/** Snowflake of the user who made the change. */
	readonly updatedBy?: string;
}

/**
 * Persistence port for module settings: the kernel's only view of a database.
 * An adapter over any engine (a JSON file, SQLite, Postgres, MongoDB, Redis)
 * implements it in the bot or in an opt-in package, never in the kernel, and
 * proves it with `runSettingsStoreContract` from
 * `@azurioh/discord-kernel/settings/testing`.
 *
 * Guarantees every implementation must honour:
 *
 * - **Isolation.** A record is keyed by `(guildId, moduleId)`; reading, writing
 *   or deleting one key never touches another.
 * - **Atomic compare-and-set.** `write` checks the stored revision and replaces
 *   the record in one atomic step of the engine, so that of several writers
 *   holding the same `expectedRevision` (Discord shards, an HTTP API) exactly
 *   one wins and the others get `ConflictError`.
 * - **Independent copies.** The store never keeps a reference to the record it
 *   was given nor hands out one it keeps: callers may mutate what they pass in
 *   or get back without changing what is stored.
 * - **Errors are real.** Only a revision mismatch is a `ConflictError`; any
 *   other failure (connection lost, corrupt data) is thrown as it is.
 */
export interface SettingsStore {
	/**
	 * The record of one module in one guild.
	 *
	 * @returns a copy of the stored record, or `null` when none was written yet
	 * (or it was deleted).
	 */
	read(guildId: string, moduleId: string): Promise<StoredSettings | null>;
	/**
	 * Persist `record` as a whole, replacing any stored one, if and only if the
	 * stored revision is `expectedRevision`.
	 *
	 * @param opts.expectedRevision - the revision the caller read; `null` means
	 * no record may exist yet (a create).
	 * @throws ConflictError when the stored revision (or `null` for no record)
	 * differs from `expectedRevision`. The stored record is then left unchanged.
	 */
	write(record: StoredSettings, opts: { expectedRevision: number | null }): Promise<void>;
	/**
	 * Remove the record of one module in one guild, whatever its revision.
	 * Idempotent: deleting a missing record succeeds and does nothing.
	 */
	delete(guildId: string, moduleId: string): Promise<void>;
}
