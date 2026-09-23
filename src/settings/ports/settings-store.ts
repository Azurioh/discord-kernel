/**
 * The record a {@link SettingsStore} persists, one per `(guildId, moduleId)`.
 */
export interface StoredSettings {
	readonly guildId: string;
	/** Equals the declaration id of the module that owns these values. */
	readonly moduleId: string;
	/** Declaration version the values were written under. */
	readonly version: number;
	/** Starts at 1 on first write; +1 on each write. Used for optimistic concurrency. */
	readonly revision: number;
	/** Only declared, valid fields; unset fields are absent. */
	readonly values: Readonly<Record<string, unknown>>;
	/** ISO-8601 timestamp from the `Clock` port. */
	readonly updatedAt: string;
	/** Snowflake of the user who made the change. */
	readonly updatedBy?: string;
}

/**
 * Persistence port for module settings. Implementations must honour optimistic
 * concurrency: several processes (Discord shards, an HTTP API) can write the
 * same guild's settings.
 */
export interface SettingsStore {
	read(guildId: string, moduleId: string): Promise<StoredSettings | null>;
	/**
	 * Persist `record`. `expectedRevision` is the revision the caller read:
	 * `null` means no record may exist yet. A mismatch throws `ConflictError`
	 * and leaves the stored record unchanged.
	 */
	write(record: StoredSettings, opts: { expectedRevision: number | null }): Promise<void>;
	delete(guildId: string, moduleId: string): Promise<void>;
}
