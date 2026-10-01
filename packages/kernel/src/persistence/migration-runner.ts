/** One schema or data change, applied once and identified by a stable `id`. */
export interface Migration {
	readonly id: string;
	up(): Promise<void> | void;
}

/** What one {@link MigrationRunner.run} applied, in application order. */
export interface MigrationReport {
	readonly applied: readonly string[];
}

/**
 * Applies the pending migrations of a database before the bot serves anyone.
 * The adapter owns where applied ids are remembered (a table, a collection).
 *
 * Guarantees every implementation must honour (`runMigrationRunnerContract`):
 * migrations run in declaration order; a second `run()` applies nothing; a
 * failing migration rejects `run()` and the ones after it are not applied.
 *
 * @port
 */
export interface MigrationRunner {
	run(): Promise<MigrationReport>;
}
