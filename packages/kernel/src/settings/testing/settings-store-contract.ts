import { ConflictError } from "@/errors/business-error";
import type { SettingsStore, StoredSettings } from "@/settings/ports/settings-store";

/** Minimal shape of a test runner's `describe`, so this suite imports no framework. */
export type DescribeFn = (name: string, body: () => void) => void;

/** Minimal shape of a test runner's `it`. */
export type ItFn = (name: string, body: () => Promise<void>) => void;

/** The assertions this suite relies on; Vitest's and Jest's `expect` both satisfy it. */
export interface ContractAssertion {
	toBe(expected: unknown): void;
	toEqual(expected: unknown): void;
	toBeNull(): void;
	toBeInstanceOf(expected: abstract new (...args: never[]) => unknown): void;
}

/** Minimal shape of a test runner's `expect`. */
export type ExpectFn = (actual: unknown) => ContractAssertion;

const GUILD_A = "100000000000000001";
const GUILD_B = "100000000000000002";
const MODULE_A = "tickets";
const MODULE_B = "welcome";

function record(overrides: Partial<StoredSettings> = {}): StoredSettings {
	return {
		guildId: GUILD_A,
		moduleId: MODULE_A,
		version: 1,
		revision: 1,
		values: { maxOpen: 2 },
		updatedAt: "2026-01-01T00:00:00.000Z",
		updatedBy: "200000000000000001",
		...overrides,
	};
}

async function captureError(action: () => Promise<unknown>): Promise<unknown> {
	try {
		await action();
	} catch (error) {
		return error;
	}
	return undefined;
}

/** The caller's view of a record it may scribble on, to prove the store kept its own copy. */
function mutableValues(stored: StoredSettings | null): Record<string, unknown> {
	return (stored?.values ?? {}) as Record<string, unknown>;
}

/**
 * Behaviour every {@link SettingsStore} implementation must have: one case per
 * guarantee stated on the port. Run it from the adapter's own test file with
 * the test runner's `describe`, `it` and `expect`:
 * `runSettingsStoreContract(createMyStore, { describe, it, expect })`.
 *
 * @param createStore - returns a store with no record in it; called once per case.
 * @param runner - the test runner's functions, so this suite imports no framework.
 */
export function runSettingsStoreContract(
	createStore: () => SettingsStore | Promise<SettingsStore>,
	runner: { describe: DescribeFn; it: ItFn; expect: ExpectFn },
): void {
	const { describe, it, expect } = runner;

	/**
	 * Deleting the default record must leave `other` — the same record moved to
	 * another guild or another module — exactly as it was written.
	 */
	async function expectDeleteLeavesAlone(other: StoredSettings): Promise<void> {
		const store = await createStore();
		await store.write(record(), { expectedRevision: null });
		await store.write(other, { expectedRevision: null });

		await store.delete(GUILD_A, MODULE_A);

		expect(await store.read(GUILD_A, MODULE_A)).toBeNull();
		expect(await store.read(other.guildId, other.moduleId)).toEqual(other);
	}

	describe("SettingsStore contract", () => {
		it("reads null when no record exists", async () => {
			const store = await createStore();

			expect(await store.read(GUILD_A, MODULE_A)).toBeNull();
		});

		it("creates a record when the expected revision is null", async () => {
			const store = await createStore();
			const created = record();

			await store.write(created, { expectedRevision: null });

			expect(await store.read(GUILD_A, MODULE_A)).toEqual(created);
		});

		it("rejects a create when a record already exists", async () => {
			const store = await createStore();
			await store.write(record(), { expectedRevision: null });

			const error = await captureError(() =>
				store.write(record({ values: { maxOpen: 3 } }), { expectedRevision: null }),
			);

			expect(error).toBeInstanceOf(ConflictError);
			expect(await store.read(GUILD_A, MODULE_A)).toEqual(record());
		});

		it("rejects an update when no record exists", async () => {
			const store = await createStore();

			const error = await captureError(() =>
				store.write(record({ revision: 2 }), { expectedRevision: 1 }),
			);

			expect(error).toBeInstanceOf(ConflictError);
			expect(await store.read(GUILD_A, MODULE_A)).toBeNull();
		});

		it("rejects a write with a stale revision and keeps the stored record", async () => {
			const store = await createStore();
			await store.write(record(), { expectedRevision: null });
			const second = record({ revision: 2, values: { maxOpen: 3 } });
			await store.write(second, { expectedRevision: 1 });

			const error = await captureError(() =>
				store.write(record({ revision: 2, values: { maxOpen: 4 } }), { expectedRevision: 1 }),
			);

			expect(error).toBeInstanceOf(ConflictError);
			expect(await store.read(GUILD_A, MODULE_A)).toEqual(second);
		});

		it("increments the revision by one on each write", async () => {
			const store = await createStore();
			await store.write(record(), { expectedRevision: null });
			await store.write(record({ revision: 2 }), { expectedRevision: 1 });
			await store.write(record({ revision: 3 }), { expectedRevision: 2 });

			const stored = await store.read(GUILD_A, MODULE_A);

			expect(stored?.revision).toBe(3);
		});

		it("deletes a record", async () => {
			const store = await createStore();
			await store.write(record(), { expectedRevision: null });

			await store.delete(GUILD_A, MODULE_A);

			expect(await store.read(GUILD_A, MODULE_A)).toBeNull();
		});

		it("deletes a missing record without error", async () => {
			const store = await createStore();

			const error = await captureError(() => store.delete(GUILD_A, MODULE_A));

			expect(error).toBe(undefined);
			expect(await store.read(GUILD_A, MODULE_A)).toBeNull();
		});

		it("accepts a create again after a delete", async () => {
			const store = await createStore();
			await store.write(record(), { expectedRevision: null });
			await store.delete(GUILD_A, MODULE_A);

			await store.write(record(), { expectedRevision: null });

			expect(await store.read(GUILD_A, MODULE_A)).toEqual(record());
		});

		it("keeps guilds isolated", async () => {
			await expectDeleteLeavesAlone(record({ guildId: GUILD_B, values: { maxOpen: 5 } }));
		});

		it("keeps modules isolated", async () => {
			await expectDeleteLeavesAlone(record({ moduleId: MODULE_B, values: { greeting: "hi" } }));
		});

		it("round-trips every JSON value shape", async () => {
			const store = await createStore();
			const created = record({
				values: {
					text: "Salut « à vous » 👋",
					count: -1.5,
					enabled: false,
					cleared: null,
					roles: ["300000000000000001", "300000000000000002"],
					nested: { toggles: { a: true }, list: [] },
				},
			});

			await store.write(created, { expectedRevision: null });

			expect(await store.read(GUILD_A, MODULE_A)).toEqual(created);
		});

		it("keeps an absent updatedBy absent", async () => {
			const store = await createStore();
			const { updatedBy: _omitted, ...anonymous } = record();

			await store.write(anonymous, { expectedRevision: null });

			expect(await store.read(GUILD_A, MODULE_A)).toEqual(anonymous);
		});

		it("keeps a written record independent of the caller's object", async () => {
			const store = await createStore();
			const written = record();
			await store.write(written, { expectedRevision: null });

			mutableValues(written).maxOpen = 99;

			expect(await store.read(GUILD_A, MODULE_A)).toEqual(record());
		});

		it("returns a record the caller can change without changing the store", async () => {
			const store = await createStore();
			await store.write(record(), { expectedRevision: null });

			mutableValues(await store.read(GUILD_A, MODULE_A)).maxOpen = 99;

			expect(await store.read(GUILD_A, MODULE_A)).toEqual(record());
		});

		it("lets exactly one of two concurrent creates win", async () => {
			const store = await createStore();
			const first = record({ values: { maxOpen: 3 } });
			const second = record({ values: { maxOpen: 4 } });

			const outcomes = await Promise.allSettled([
				store.write(first, { expectedRevision: null }),
				store.write(second, { expectedRevision: null }),
			]);

			await expectOneWinner(store, outcomes, [first, second]);
		});

		it("lets exactly one of two concurrent updates of the same revision win", async () => {
			const store = await createStore();
			await store.write(record(), { expectedRevision: null });
			const first = record({ revision: 2, values: { maxOpen: 3 } });
			const second = record({ revision: 2, values: { maxOpen: 4 } });

			const outcomes = await Promise.allSettled([
				store.write(first, { expectedRevision: 1 }),
				store.write(second, { expectedRevision: 1 }),
			]);

			await expectOneWinner(store, outcomes, [first, second]);
		});
	});

	/**
	 * Of two racing writes, exactly one lands, the other fails with a
	 * `ConflictError`, and the stored record is the winner's.
	 */
	async function expectOneWinner(
		store: SettingsStore,
		outcomes: readonly PromiseSettledResult<void>[],
		written: readonly [StoredSettings, StoredSettings],
	): Promise<void> {
		const winners = outcomes.flatMap((outcome, index) =>
			outcome.status === "fulfilled" ? [written[index]] : [],
		);
		const losers = outcomes.flatMap((outcome) =>
			outcome.status === "rejected" ? [outcome.reason] : [],
		);

		expect(winners.length).toBe(1);
		expect(losers.length).toBe(1);
		expect(losers[0]).toBeInstanceOf(ConflictError);
		expect(await store.read(GUILD_A, MODULE_A)).toEqual(winners[0]);
	}
}
