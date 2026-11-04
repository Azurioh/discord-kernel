import * as fs from "node:fs/promises";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSettingsStoreContract } from "@azurioh/discord-kernel/settings/testing";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createJsonFileSettingsStore } from "@/shared/settings/json-file-settings-store";
import { CorruptSettingsFileError } from "@/shared/settings/json-file-settings-store-errors";

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof fs>();
	return { ...actual, rename: vi.fn(actual.rename) };
});

const directories: string[] = [];

/** A manually released barrier for pausing persistence at the atomic rename. */
function createBarrier() {
	let resolve!: () => void;
	const promise = new Promise<void>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

/** A store over a file in a fresh directory, so no two tests share state. */
async function createStore() {
	const directory = await mkdtemp(join(tmpdir(), "sandbox-settings-"));
	directories.push(directory);
	return {
		directory,
		store: createJsonFileSettingsStore(join(directory, "nested", "settings.json")),
	};
}

afterAll(async () => {
	await Promise.all(
		directories.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

runSettingsStoreContract(async () => (await createStore()).store, { describe, it, expect });

describe("createJsonFileSettingsStore", () => {
	it.each(["write", "delete"] as const)(
		"awaits a %s enqueued after drain starts",
		async (mutation) => {
			const { store } = await createStore();
			const record = {
				guildId: "1",
				moduleId: "demo",
				version: 1,
				revision: 1,
				values: {},
				updatedAt: "2026-01-01T00:00:00.000Z",
			};
			const firstRenaming = createBarrier();
			const releaseFirst = createBarrier();
			const lateRenaming = createBarrier();
			const releaseLate = createBarrier();
			const { rename } = await vi.importActual<typeof fs>("node:fs/promises");
			const pausedRename = vi
				.mocked(fs.rename)
				.mockImplementationOnce(async (...args) => {
					firstRenaming.resolve();
					await releaseFirst.promise;
					await rename(...args);
				})
				.mockImplementationOnce(async (...args) => {
					lateRenaming.resolve();
					await releaseLate.promise;
					await rename(...args);
				});
			const first = store.write(record, { expectedRevision: null });
			await firstRenaming.promise;
			const drained = vi.fn();
			const drain = store.drain().then(drained);
			const late =
				mutation === "write"
					? store.write({ ...record, revision: 2 }, { expectedRevision: 1 })
					: store.delete("1", "demo");
			try {
				releaseFirst.resolve();
				await lateRenaming.promise;
				await new Promise<void>((resolve) => setImmediate(resolve));
				expect(drained).not.toHaveBeenCalled();
				releaseLate.resolve();
				await drain;
				expect(await store.read("1", "demo")).toEqual(
					mutation === "write" ? { ...record, revision: 2 } : null,
				);
			} finally {
				releaseFirst.resolve();
				releaseLate.resolve();
				await Promise.allSettled([first, late, drain]);
				pausedRename.mockReset();
				pausedRename.mockImplementation(rename);
			}
		},
	);

	it.each([false, true])(
		"propagates a late failure after all batches settle (earlier failure: %s)",
		async (failFirst) => {
			const { store } = await createStore();
			const firstFailure = new CorruptSettingsFileError("first.json");
			const lateFailure = new CorruptSettingsFileError("late.json");
			const firstRenaming = createBarrier();
			const releaseFirst = createBarrier();
			const lateRenaming = createBarrier();
			const releaseLate = createBarrier();
			const { rename } = await vi.importActual<typeof fs>("node:fs/promises");
			const pausedRename = vi
				.mocked(fs.rename)
				.mockImplementationOnce(async (...args) => {
					firstRenaming.resolve();
					await releaseFirst.promise;
					if (failFirst) {
						throw firstFailure;
					}
					await rename(...args);
				})
				.mockImplementationOnce(async () => {
					lateRenaming.resolve();
					await releaseLate.promise;
					throw lateFailure;
				});
			const first = store.delete("1", "demo");
			await firstRenaming.promise;
			const settled = vi.fn();
			const drain = store.drain();
			void drain.then(settled, settled);
			const late = store.delete("2", "demo");
			try {
				releaseFirst.resolve();
				await lateRenaming.promise;
				await new Promise<void>((resolve) => setImmediate(resolve));
				expect(settled).not.toHaveBeenCalled();
				releaseLate.resolve();
				if (failFirst) {
					await expect(drain).rejects.toBeInstanceOf(AggregateError);
					await expect(drain).rejects.toHaveProperty("errors", [firstFailure, lateFailure]);
				} else {
					await expect(drain).rejects.toBe(lateFailure);
				}
			} finally {
				releaseFirst.resolve();
				releaseLate.resolve();
				await Promise.allSettled([first, late, drain]);
				pausedRename.mockReset();
				pausedRename.mockImplementation(rename);
			}
		},
	);

	it("drains a pending write only after its atomic rename persists the record", async () => {
		const { directory } = await createStore();
		const file = join(directory, "settings.json");
		const store = createJsonFileSettingsStore(file);
		const record = {
			guildId: "1",
			moduleId: "demo",
			version: 1,
			revision: 1,
			values: { mode: "strict" },
			updatedAt: "2026-01-01T00:00:00.000Z",
		};
		const renaming = createBarrier();
		const release = createBarrier();
		const { rename } = await vi.importActual<typeof fs>("node:fs/promises");
		const pausedRename = vi.mocked(fs.rename).mockImplementationOnce(async (...args) => {
			renaming.resolve();
			await release.promise;
			await rename(...args);
		});
		const write = store.write(record, { expectedRevision: null });
		try {
			await renaming.promise;
			const drained = vi.fn();
			const drain = store.drain().then(drained);
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(drained).not.toHaveBeenCalled();
			expect(await createJsonFileSettingsStore(file).read("1", "demo")).toBeNull();
			release.resolve();
			await drain;
			expect(await createJsonFileSettingsStore(file).read("1", "demo")).toEqual(record);
		} finally {
			release.resolve();
			await write;
			pausedRename.mockReset();
			pausedRename.mockImplementation(rename);
		}
	});

	it("propagates a pending persistence failure through drain", async () => {
		const { store } = await createStore();
		expect(store.drain).toBeTypeOf("function");
		const failure = new CorruptSettingsFileError("settings.json");
		const failedRename = vi.mocked(fs.rename).mockRejectedValueOnce(failure);
		try {
			const deletion = store.delete("1", "demo");
			await Promise.all([
				expect(deletion).rejects.toBe(failure),
				expect(store.drain()).rejects.toBe(failure),
			]);
		} finally {
			failedRename.mockClear();
		}
	});

	it("keeps records across store instances over the same file", async () => {
		const { directory } = await createStore();
		const file = join(directory, "settings.json");
		const record = {
			guildId: "1",
			moduleId: "demo",
			version: 1,
			revision: 1,
			values: { mode: "strict" },
			updatedAt: "2026-01-01T00:00:00.000Z",
		};

		await createJsonFileSettingsStore(file).write(record, { expectedRevision: null });

		expect(await createJsonFileSettingsStore(file).read("1", "demo")).toEqual(record);
	});

	it("leaves no temporary file behind", async () => {
		const { directory } = await createStore();
		const store = createJsonFileSettingsStore(join(directory, "settings.json"));

		await store.write(
			{
				guildId: "1",
				moduleId: "demo",
				version: 1,
				revision: 1,
				values: {},
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
			{ expectedRevision: null },
		);

		expect(await readdir(directory)).toEqual(["settings.json"]);
	});

	it("refuses a file that does not hold an object of records", async () => {
		const { directory } = await createStore();
		const file = join(directory, "settings.json");
		await writeFile(file, "[]", "utf8");

		await expect(createJsonFileSettingsStore(file).read("1", "demo")).rejects.toBeInstanceOf(
			CorruptSettingsFileError,
		);
	});
});
