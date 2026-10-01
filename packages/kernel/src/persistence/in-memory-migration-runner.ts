import type { Migration, MigrationRunner } from "@/persistence/migration-runner";

/**
 * {@link MigrationRunner} that remembers the applied ids in memory. Runs the
 * pending migrations one after another, and stops at the first that rejects,
 * rethrowing its error: a later `run()` resumes from it.
 *
 * @param migrations - in the order they must apply.
 */
export function createInMemoryMigrationRunner(migrations: readonly Migration[]): MigrationRunner {
	const applied = new Set<string>();

	return {
		async run() {
			const appliedNow: string[] = [];
			for (const migration of migrations.filter(({ id }) => !applied.has(id))) {
				await migration.up();
				applied.add(migration.id);
				appliedNow.push(migration.id);
			}
			return { applied: appliedNow };
		},
	};
}
