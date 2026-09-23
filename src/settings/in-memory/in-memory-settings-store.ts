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
			const current = guilds.get(record.guildId)?.get(record.moduleId);
			// The port speaks `null` for "no record yet", so an absent record compares as `null`.
			const currentRevision = current === undefined ? null : current.revision;
			if (currentRevision !== expectedRevision) {
				throw new ConflictError(
					`Settings of module "${record.moduleId}" in guild ${record.guildId} changed concurrently (expected revision ${expectedRevision}, found ${currentRevision})`,
				);
			}
			let modules = guilds.get(record.guildId);
			if (modules === undefined) {
				modules = new Map<string, StoredSettings>();
				guilds.set(record.guildId, modules);
			}
			modules.set(record.moduleId, structuredClone(record));
		},

		async delete(guildId, moduleId) {
			const modules = guilds.get(guildId);
			if (modules === undefined) {
				return;
			}
			modules.delete(moduleId);
			if (modules.size === 0) {
				guilds.delete(guildId);
			}
		},
	};
}
