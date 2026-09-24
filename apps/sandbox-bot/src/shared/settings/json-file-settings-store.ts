import { createKeyedQueue } from "@azurioh/discord-kernel/concurrency/keyed-queue";
import { ConflictError } from "@azurioh/discord-kernel/errors/business-error";
import type { SettingsStore } from "@azurioh/discord-kernel/settings";
import { loadRecords, recordKey, saveRecords } from "@/shared/settings/settings-records-file";

/** Every write to one file goes through this key, so read-check-write never interleaves. */
const FILE_QUEUE_KEY = "file";

/**
 * A {@link SettingsStore} over one JSON file, for a single-process bot. Writes
 * are serialised in process and land atomically.
 *
 * @param filePath - the JSON file; created with its directory on first write.
 * @returns the store.
 */
export function createJsonFileSettingsStore(filePath: string): SettingsStore {
	const queue = createKeyedQueue();

	return {
		async read(guildId, moduleId) {
			return (await loadRecords(filePath))[recordKey(guildId, moduleId)] ?? null;
		},

		write(record, { expectedRevision }) {
			return queue.run(FILE_QUEUE_KEY, async () => {
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
		},

		delete(guildId, moduleId) {
			return queue.run(FILE_QUEUE_KEY, async () => {
				const { [recordKey(guildId, moduleId)]: _deleted, ...kept } = await loadRecords(filePath);
				await saveRecords(filePath, kept);
			});
		},
	};
}
