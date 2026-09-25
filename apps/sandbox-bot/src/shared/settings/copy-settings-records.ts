import { ConflictError } from "@azurioh/discord-kernel/errors/business-error";
import type { SettingsStore, StoredSettings } from "@azurioh/discord-kernel/settings";

/** A record the target already held, left untouched. */
interface SkippedRecord {
	readonly guildId: string;
	readonly moduleId: string;
}

export interface CopyResult {
	readonly copied: number;
	readonly skipped: readonly SkippedRecord[];
}

/**
 * Copy settings records into another store, as they were: same values,
 * revision and author. Each write is a create (`expectedRevision: null`), so a
 * record the target already holds is never overwritten: the port refuses it
 * with `ConflictError`, and it is reported as skipped. Any other failure stops
 * the copy.
 *
 * Works for any pair of adapters, since it only uses the `SettingsStore` port.
 *
 * @param params.records - the records to copy, read from the source.
 * @param params.target - the store to copy them into.
 * @returns how many were copied, and which were skipped.
 */
export async function copySettingsRecords(params: {
	records: Iterable<StoredSettings>;
	target: SettingsStore;
}): Promise<CopyResult> {
	let copied = 0;
	const skipped: SkippedRecord[] = [];
	for (const record of params.records) {
		try {
			await params.target.write(record, { expectedRevision: null });
			copied += 1;
		} catch (error) {
			if (!(error instanceof ConflictError)) {
				throw error;
			}
			skipped.push({ guildId: record.guildId, moduleId: record.moduleId });
		}
	}
	return { copied, skipped };
}
