import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@/errors/business-error";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import type { SettingsStore, StoredSettings } from "@/settings/ports/settings-store";
import { runSettingsStoreContract } from "@/settings/testing/settings-store-contract";

interface ContractCase {
	readonly name: string;
	readonly body: () => Promise<void>;
}

/**
 * Run the contract against `createStore` outside the test runner's registry and
 * return the names of the cases that fail, so each case is shown to catch the
 * defect it is written for.
 */
async function failingCases(
	createStore: () => SettingsStore | Promise<SettingsStore>,
): Promise<string[]> {
	const cases: ContractCase[] = [];
	runSettingsStoreContract(createStore, {
		describe: (_name, body) => body(),
		it: (name, body) => cases.push({ name, body }),
		expect,
	});
	const failed: string[] = [];
	for (const contractCase of cases) {
		try {
			await contractCase.body();
		} catch {
			failed.push(contractCase.name);
		}
	}
	return failed;
}

function key(guildId: string, moduleId: string): string {
	return `${guildId}/${moduleId}`;
}

/** A map-backed store with one defect switched on, to prove the contract notices it. */
function createDefectiveStore(defect: "aliasing" | "strict-delete" | "racy"): SettingsStore {
	const records = new Map<string, StoredSettings>();
	return {
		async read(guildId, moduleId) {
			const stored = records.get(key(guildId, moduleId));
			if (stored === undefined) {
				return null;
			}
			return defect === "aliasing" ? stored : structuredClone(stored);
		},
		async write(record, { expectedRevision }) {
			const current = records.get(key(record.guildId, record.moduleId))?.revision ?? null;
			if (current !== expectedRevision) {
				throw new ConflictError("stale");
			}
			if (defect === "racy") {
				// The check and the set are not atomic: another writer slips in between.
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
			records.set(
				key(record.guildId, record.moduleId),
				defect === "aliasing" ? record : structuredClone(record),
			);
		},
		async delete(guildId, moduleId) {
			if (defect === "strict-delete" && !records.has(key(guildId, moduleId))) {
				throw new NotFoundError("missing");
			}
			records.delete(key(guildId, moduleId));
		},
	};
}

describe("runSettingsStoreContract", () => {
	it("passes a store that honours every guarantee", async () => {
		expect(await failingCases(createInMemorySettingsStore)).toEqual([]);
	});

	it("catches a store that shares records with its callers", async () => {
		expect(await failingCases(() => createDefectiveStore("aliasing"))).toEqual([
			"keeps a written record independent of the caller's object",
			"returns a record the caller can change without changing the store",
		]);
	});

	it("catches a store whose delete fails on a missing record", async () => {
		expect(await failingCases(() => createDefectiveStore("strict-delete"))).toEqual([
			"deletes a missing record without error",
		]);
	});

	it("catches a store whose compare-and-set is not atomic", async () => {
		expect(await failingCases(() => createDefectiveStore("racy"))).toEqual([
			"lets exactly one of two concurrent creates win",
			"lets exactly one of two concurrent updates of the same revision win",
		]);
	});
});
