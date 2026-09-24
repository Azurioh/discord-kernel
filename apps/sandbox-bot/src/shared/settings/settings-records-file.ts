import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { StoredSettings } from "@azurioh/discord-kernel/settings";
import { isMissingFile } from "@/shared/fs/is-missing-file";
import { CorruptSettingsFileError } from "@/shared/settings/json-file-settings-store-errors";

/** The whole file: every record, keyed by {@link recordKey}. */
export type Records = Readonly<Record<string, StoredSettings>>;

/** Where one guild's settings of one module sit in {@link Records}. */
export function recordKey(guildId: string, moduleId: string): string {
	return `${guildId}/${moduleId}`;
}

/**
 * Only the store writes the file, so a JSON object is trusted to hold records;
 * anything else means the file was edited by hand into a shape it cannot read.
 */
function isRecords(value: unknown): value is Records {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read every record; a file that does not exist yet holds none.
 *
 * @throws CorruptSettingsFileError when the file is not a JSON object.
 */
export async function loadRecords(filePath: string): Promise<Records> {
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
export async function saveRecords(filePath: string, records: Records): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	const temporary = `${filePath}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(records, null, "\t")}\n`, "utf8");
	await rename(temporary, filePath);
}
