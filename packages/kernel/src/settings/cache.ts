import type { Clock } from "@/clock";
import type { SettingsChangedNotifier } from "@/settings/ports/settings-changed-notifier";

/** How long a cached read stays fresh without an invalidation: the multi-process safety net (R15). */
export const SETTINGS_CACHE_TTL_MS = 60_000;

/** Reads of one module's settings for one guild, kept in process. */
export interface SettingsCache {
	/**
	 * The cached value of `(guildId, moduleId)` while fresh, otherwise the result
	 * of `load`, kept for {@link SETTINGS_CACHE_TTL_MS}. A failed load is not
	 * kept, and neither is a load that an invalidation overtook.
	 */
	read<T>(guildId: string, moduleId: string, load: () => Promise<T>): Promise<T>;
	/** Forget `(guildId, moduleId)`, so the next read loads again. */
	invalidate(guildId: string, moduleId: string): void;
}

interface Entry {
	readonly value: unknown;
	readonly expiresAt: number;
}

/**
 * Create the settings read cache. It drops an entry when the notifier reports
 * a change of it, whichever process made the change, and after
 * {@link SETTINGS_CACHE_TTL_MS} in any case.
 *
 * @param deps.clock - tells when an entry expires.
 * @param deps.notifier - the settings change events to invalidate on.
 * @returns an empty cache, subscribed to the notifier for its whole life.
 */
export function createSettingsCache(deps: {
	clock: Clock;
	notifier: SettingsChangedNotifier;
}): SettingsCache {
	const { clock } = deps;
	const entries = new Map<string, Entry>();
	/** Bumped by each invalidation, so a load that started before one is not kept. */
	const generations = new Map<string, number>();

	function invalidate(guildId: string, moduleId: string): void {
		const key = cacheKey(guildId, moduleId);
		entries.delete(key);
		generations.set(key, (generations.get(key) ?? 0) + 1);
	}

	deps.notifier.subscribe((event) => invalidate(event.guildId, event.moduleId));

	return {
		async read<T>(guildId: string, moduleId: string, load: () => Promise<T>): Promise<T> {
			const key = cacheKey(guildId, moduleId);
			const entry = entries.get(key);
			if (entry !== undefined && clock.now().getTime() < entry.expiresAt) {
				return entry.value as T;
			}
			const generation = generations.get(key);
			const value = await load();
			if (generations.get(key) === generation) {
				entries.set(key, { value, expiresAt: clock.now().getTime() + SETTINGS_CACHE_TTL_MS });
			}
			return value;
		},
		invalidate,
	};
}

function cacheKey(guildId: string, moduleId: string): string {
	return JSON.stringify([guildId, moduleId]);
}
