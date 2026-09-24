import type { ChannelKind, GuildDirectory } from "@/settings/ports/guild-directory";

interface NamedEntity {
	readonly id: string;
	readonly name: string;
}

interface ChannelEntity extends NamedEntity {
	readonly kind: ChannelKind;
}

/** Entities of one guild; omitted lists are empty. */
export interface GuildDirectorySeedEntry {
	readonly channels?: readonly ChannelEntity[];
	readonly roles?: readonly NamedEntity[];
	readonly members?: readonly NamedEntity[];
}

/** Seeded guild contents, keyed by guild id. */
export type GuildDirectorySeed = Readonly<Record<string, GuildDirectorySeedEntry>>;

function findById<T extends NamedEntity>(entities: readonly T[] | undefined, id: string): T | null {
	return entities?.find((entity) => entity.id === id) ?? null;
}

function searchByPrefix<T extends NamedEntity>(
	entities: readonly T[] | undefined,
	query: string,
): T[] {
	const prefix = query.toLowerCase();
	return (entities ?? []).filter((entity) => entity.name.toLowerCase().startsWith(prefix));
}

/**
 * {@link GuildDirectory} over a fixed seed: the test twin for settings logic
 * that checks or suggests channels, roles and members. Search matches a
 * case-insensitive name prefix, in seed order.
 */
export function createInMemoryGuildDirectory(seed: GuildDirectorySeed): GuildDirectory {
	return {
		async channel(guildId, id) {
			return findById(seed[guildId]?.channels, id);
		},

		async role(guildId, id) {
			return findById(seed[guildId]?.roles, id);
		},

		async member(guildId, id) {
			return findById(seed[guildId]?.members, id);
		},

		async searchChannels(guildId, query, kinds) {
			const matches = searchByPrefix(seed[guildId]?.channels, query);
			if (kinds === undefined) {
				return matches;
			}
			return matches.filter((channel) => kinds.includes(channel.kind));
		},

		async searchRoles(guildId, query) {
			return searchByPrefix(seed[guildId]?.roles, query);
		},

		async searchMembers(guildId, query) {
			return searchByPrefix(seed[guildId]?.members, query);
		},
	};
}
