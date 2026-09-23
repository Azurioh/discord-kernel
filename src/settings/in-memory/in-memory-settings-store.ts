import { ConflictError } from "@/errors/business-error";
import type { SettingsStore, StoredSettings } from "@/settings/ports/settings-store";

/**
 * {@link SettingsStore} held in process memory: the test twin and the default
 * for a bot that does not need settings to survive a restart. Records are
 * cloned on the way in and out so callers never share state with the store.
 */
export function createInMemorySettingsStore(): SettingsStore {
	const guilds = new Map<string, Map<string, StoredSettings>>();

	return {
		async read(guildId, moduleId) {
			const stored = guilds.get(guildId)?.get(moduleId);
			return stored === undefined ? null : structuredClone(stored);
		},

		async write(record, { expectedRevision }) {
			const modules = guilds.get(record.guildId) ?? new Map<string, StoredSettings>();
			const currentRevision = modules.get(record.moduleId)?.revision ?? null;
			if (currentRevision !== expectedRevision) {
				throw new ConflictError(
					`Settings of module "${record.moduleId}" in guild ${record.guildId} changed concurrently (expected revision ${expectedRevision}, found ${currentRevision})`,
				);
			}
			modules.set(record.moduleId, structuredClone(record));
			guilds.set(record.guildId, modules);
		},

		async delete(guildId, moduleId) {
			guilds.get(guildId)?.delete(moduleId);
		},
	};
}
