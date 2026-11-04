import { createKeyedQueue } from "@azurioh/discord-kernel/concurrency/keyed-queue";
import { ConflictError } from "@azurioh/discord-kernel/errors/business-error";
import type { SettingsStore } from "@azurioh/discord-kernel/settings";
import { loadRecords, recordKey, saveRecords } from "@/shared/settings/settings-records-file";

/** Every write to one file goes through this key, so read-check-write never interleaves. */
const FILE_QUEUE_KEY = "file";

/** Retain each mutation until it settles, without replacing its rejection. */
function trackWrite(params: { pending: Set<Promise<void>>; write: Promise<void> }): Promise<void> {
	const { pending, write } = params;
	pending.add(write);
	void write.then(
		() => pending.delete(write),
		() => pending.delete(write),
	);
	return write;
}

/**
 * A {@link SettingsStore} over one JSON file, for a single-process bot. Writes
 * are serialised in process and land atomically.
 *
 * @param filePath - the JSON file; created with its directory on first write.
 * @returns the store with a drain that awaits pending mutations and propagates failures.
 */
export function createJsonFileSettingsStore(filePath: string): SettingsStore & {
	/** Await all pending writes and deletes, rejecting if persistence fails. */
	drain(): Promise<void>;
} {
	const queue = createKeyedQueue();
	const pending = new Set<Promise<void>>();

	return {
		async drain() {
			const failures: unknown[] = [];
			while (pending.size > 0) {
				const results = await Promise.allSettled(pending);
				for (const result of results) {
					if (result.status === "rejected") {
						failures.push(result.reason);
					}
				}
			}
			if (failures.length > 1) {
				throw new AggregateError(failures, "Settings mutations failed during drain");
			}
			if (failures.length === 1) {
				throw failures[0];
			}
		},

		async read(guildId, moduleId) {
			return (await loadRecords(filePath))[recordKey(guildId, moduleId)] ?? null;
		},

		write(record, { expectedRevision }) {
			const write = queue.run(FILE_QUEUE_KEY, async () => {
				const records = await loadRecords(filePath);
				const key = recordKey(record.guildId, record.moduleId);
				const storedRevision = records[key]?.revision ?? null;
				if (storedRevision !== expectedRevision) {
					throw new ConflictError(
						`Settings ${key} are at revision ${storedRevision}, not ${expectedRevision}`,
					);
				}
				await saveRecords(filePath, { ...records, [key]: record });
			});
			return trackWrite({ pending, write });
		},

		delete(guildId, moduleId) {
			const write = queue.run(FILE_QUEUE_KEY, async () => {
				const { [recordKey(guildId, moduleId)]: _deleted, ...kept } = await loadRecords(filePath);
				await saveRecords(filePath, kept);
			});
			return trackWrite({ pending, write });
		},
	};
}
