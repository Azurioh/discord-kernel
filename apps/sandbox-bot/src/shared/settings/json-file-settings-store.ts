import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createKeyedQueue } from "@azurioh/discord-kernel/concurrency/keyed-queue";
import { ConflictError } from "@azurioh/discord-kernel/errors/business-error";
import type { SettingsStore, StoredSettings } from "@azurioh/discord-kernel/settings";

/** The whole file: every record, keyed by `guildId/moduleId`. */
type Records = Readonly<Record<string, StoredSettings>>;

/** Every write to one file goes through this key, so read-check-write never interleaves. */
const FILE_QUEUE_KEY = "file";

/** Thrown when the settings file holds something other than a JSON object of records. */
export class CorruptSettingsFileError extends Error {
	constructor(filePath: string) {
		super(`Settings file ${filePath} does not hold a JSON object of records`);
		this.name = "CorruptSettingsFileError";
	}
}

function recordKey(guildId: string, moduleId: string): string {
	return `${guildId}/${moduleId}`;
}

function isMissingFile(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Only this store writes the file, so a JSON object is trusted to hold records;
 * anything else means the file was edited by hand into a shape it cannot read.
 */
function isRecords(value: unknown): value is Records {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function loadRecords(filePath: string): Promise<Records> {
	let content: string;
	try {
		content = await readFile(filePath, "utf8");
	} catch (error) {
		if (isMissingFile(error)) {
			return {};
		}
		throw error;
	}
	const parsed: unknown = JSON.parse(content);
	if (!isRecords(parsed)) {
		throw new CorruptSettingsFileError(filePath);
	}
	return parsed;
}

/** Write to a temporary file, then rename it over the old one: a crash never leaves half a file. */
async function saveRecords(filePath: string, records: Records): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	const temporary = `${filePath}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(records, null, "\t")}\n`, "utf8");
	await rename(temporary, filePath);
}

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
