import type { Migration, MigrationRunner } from "@/persistence/migration-runner";
import { captureError } from "@/testing/capture-error";
import type { DescribeFn, ExpectFn, ItFn } from "@/testing/contract-runner";

/** A migration that records each of its runs in `log`, and rejects while `failing` is set. */
interface RecordingMigration extends Migration {
	failing: boolean;
}

function recording(id: string, log: string[]): RecordingMigration {
	const migration: RecordingMigration = {
		id,
		failing: false,
		async up() {
			if (migration.failing) {
				throw new Error(`Migration ${id} failed`);
			}
			log.push(id);
		},
	};
	return migration;
}

/**
 * Behaviour every {@link MigrationRunner} implementation must have. Run it from
 * the adapter's own test file with the test runner's `describe`, `it` and `expect`:
 * `runMigrationRunnerContract("MyRunner", (migrations) => createMyRunner(migrations), { describe, it, expect })`.
 *
 * @param name - the implementation's name, shown in the suite title.
 * @param createRunner - returns a runner over `migrations` with none applied yet;
 *   called once per case.
 * @param runner - the test runner's functions, so this suite imports no framework.
 */
export function runMigrationRunnerContract(
	name: string,
	createRunner: (migrations: readonly Migration[]) => MigrationRunner | Promise<MigrationRunner>,
	runner: { describe: DescribeFn; it: ItFn; expect: ExpectFn },
): void {
	const { describe, it, expect } = runner;

	describe(`MigrationRunner contract: ${name}`, () => {
		it("applies the migrations in declaration order and reports them in application order", async () => {
			const log: string[] = [];
			const migrations = [recording("001", log), recording("002", log), recording("003", log)];
			const subject = await createRunner(migrations);

			const report = await subject.run();

			expect(log).toEqual(["001", "002", "003"]);
			expect(report.applied).toEqual(["001", "002", "003"]);
		});

		it("applies nothing on a second run()", async () => {
			const log: string[] = [];
			const subject = await createRunner([recording("001", log), recording("002", log)]);
			await subject.run();

			const report = await subject.run();

			expect(report.applied).toEqual([]);
			expect(log).toEqual(["001", "002"]);
		});

		it("rejects on a failing migration and does not apply the later ones", async () => {
			const log: string[] = [];
			const failing = recording("002", log);
			failing.failing = true;
			const subject = await createRunner([recording("001", log), failing, recording("003", log)]);

			const error = await captureError(() => subject.run());

			expect(error).toBeInstanceOf(Error);
			expect(log).toEqual(["001"]);
		});

		it("applies only the remaining migrations on a retry once the failing one is fixed", async () => {
			const log: string[] = [];
			const failing = recording("002", log);
			failing.failing = true;
			const subject = await createRunner([recording("001", log), failing, recording("003", log)]);
			await captureError(() => subject.run());
			failing.failing = false;

			const report = await subject.run();

			expect(report.applied).toEqual(["002", "003"]);
			expect(log).toEqual(["001", "002", "003"]);
		});
	});
}
