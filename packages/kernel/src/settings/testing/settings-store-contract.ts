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

/**
 * Behaviour every {@link SettingsStore} implementation must have. Run it from
 * the adapter's own test file with the test runner's `describe`, `it` and
 * `expect`: `runSettingsStoreContract(createMyStore, { describe, it, expect })`.
 */
export function runSettingsStoreContract(
	createStore: () => SettingsStore | Promise<SettingsStore>,
	runner: { describe: DescribeFn; it: ItFn; expect: ExpectFn },
): void {
	const { describe, it, expect } = runner;

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

		it("accepts a create again after a delete", async () => {
			const store = await createStore();
			await store.write(record(), { expectedRevision: null });
			await store.delete(GUILD_A, MODULE_A);

			await store.write(record(), { expectedRevision: null });

			expect(await store.read(GUILD_A, MODULE_A)).toEqual(record());
		});

		it("keeps guilds isolated", async () => {
			const store = await createStore();
			const inB = record({ guildId: GUILD_B, values: { maxOpen: 5 } });
			await store.write(record(), { expectedRevision: null });
			await store.write(inB, { expectedRevision: null });

			await store.delete(GUILD_A, MODULE_A);

			expect(await store.read(GUILD_A, MODULE_A)).toBeNull();
			expect(await store.read(GUILD_B, MODULE_A)).toEqual(inB);
		});

		it("keeps modules isolated", async () => {
			const store = await createStore();
			const inB = record({ moduleId: MODULE_B, values: { greeting: "hi" } });
			await store.write(record(), { expectedRevision: null });
			await store.write(inB, { expectedRevision: null });

			await store.delete(GUILD_A, MODULE_A);

			expect(await store.read(GUILD_A, MODULE_A)).toBeNull();
			expect(await store.read(GUILD_A, MODULE_B)).toEqual(inB);
		});
	});
}
