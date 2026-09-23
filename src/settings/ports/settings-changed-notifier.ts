/** Emitted after a module's settings changed for a guild. */
export interface SettingsChangedEvent {
	readonly guildId: string;
	readonly moduleId: string;
	readonly changedKeys: readonly string[];
	/** Revision of the record after the change. */
	readonly revision: number;
	/** Snowflake of the user who made the change. */
	readonly changedBy?: string;
}

/**
 * Broadcasts settings changes, e.g. so read caches can invalidate. The default
 * implementation is in-process; distributed delivery is a separate adapter.
 */
export interface SettingsChangedNotifier {
	notify(event: SettingsChangedEvent): void;
	/** Register `listener`; the returned function unsubscribes it. */
	subscribe(listener: (event: SettingsChangedEvent) => void): () => void;
}
