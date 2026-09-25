import { ChannelType, type Client, type Guild } from "discord.js";
import { isMissingAccess, isUnknownResource } from "@/discord/api-errors";
import { MAX_AUTOCOMPLETE_CHOICES } from "@/discord/command/autocomplete-limits";
import type { ChannelKind, GuildDirectory } from "@/settings/ports/guild-directory";

/** Every `ChannelType` a guild channel can have: all of them except the DM ones. */
type GuildChannelType = Exclude<ChannelType, ChannelType.DM | ChannelType.GroupDM>;

/**
 * Discord's guild channel types to the kernel's kinds. Both maps are checked
 * for completeness, so a new member on either side is a compile error until
 * it is mapped here.
 */
const KIND_BY_CHANNEL_TYPE = {
	[ChannelType.GuildText]: "text",
	[ChannelType.GuildVoice]: "voice",
	[ChannelType.GuildCategory]: "category",
	[ChannelType.GuildAnnouncement]: "announcement",
	[ChannelType.AnnouncementThread]: "announcementThread",
	[ChannelType.PublicThread]: "publicThread",
	[ChannelType.PrivateThread]: "privateThread",
	[ChannelType.GuildStageVoice]: "stage",
	[ChannelType.GuildDirectory]: "directory",
	[ChannelType.GuildForum]: "forum",
	[ChannelType.GuildMedia]: "media",
} as const satisfies Record<GuildChannelType, ChannelKind>;

/** The kernel's channel kinds to Discord's guild channel types: the inverse of the map above. */
export const CHANNEL_TYPE_BY_KIND = {
	text: ChannelType.GuildText,
	voice: ChannelType.GuildVoice,
	category: ChannelType.GuildCategory,
	announcement: ChannelType.GuildAnnouncement,
	announcementThread: ChannelType.AnnouncementThread,
	publicThread: ChannelType.PublicThread,
	privateThread: ChannelType.PrivateThread,
	stage: ChannelType.GuildStageVoice,
	directory: ChannelType.GuildDirectory,
	forum: ChannelType.GuildForum,
	media: ChannelType.GuildMedia,
} as const satisfies Record<ChannelKind, GuildChannelType>;

/** Discord caps autocomplete at this many choices, so no search returns more. */
const SEARCH_LIMIT = MAX_AUTOCOMPLETE_CHOICES;

interface NamedEntity {
	readonly id: string;
	readonly name: string;
}

interface ChannelEntity extends NamedEntity {
	readonly kind: ChannelKind;
}

/** The minimal shape of a guild channel this adapter reads. */
interface GuildChannelLike {
	readonly id: string;
	readonly name: string;
	readonly type: GuildChannelType;
}

/** The minimal shape of a guild member this adapter reads. */
interface GuildMemberLike {
	readonly id: string;
	readonly displayName: string;
}

/** Resolve to `null` when Discord says the entity does not exist; rethrow anything else. */
async function orNullWhenUnknown<T>(lookup: Promise<T | null>): Promise<T | null> {
	try {
		return await lookup;
	} catch (error) {
		if (isUnknownResource(error)) {
			return null;
		}
		throw error;
	}
}

function toChannel(channel: GuildChannelLike): ChannelEntity {
	return { id: channel.id, name: channel.name, kind: KIND_BY_CHANNEL_TYPE[channel.type] };
}

function toMember(member: GuildMemberLike): NamedEntity {
	return { id: member.id, name: member.displayName };
}

function nameStartsWith(params: { name: string; query: string }): boolean {
	return params.name.toLowerCase().startsWith(params.query.toLowerCase());
}

/**
 * Search `cached` first; only when nothing there matches, search what `fetch`
 * returns. discord.js caches what it fetches, so the next lookup is local.
 */
async function searchCacheThenFetch<T>(params: {
	cached: Iterable<T>;
	fetch: () => Promise<Iterable<T>>;
	matches: (entity: T) => boolean;
}): Promise<T[]> {
	const { cached, fetch, matches } = params;
	const hits = [...cached].filter(matches);
	if (hits.length > 0) {
		return hits.slice(0, SEARCH_LIMIT);
	}
	return [...(await fetch())].filter(matches).slice(0, SEARCH_LIMIT);
}

/** The guild from the client's cache, else from Discord; `null` when the bot cannot see it. */
async function findGuild(params: { client: Client; guildId: string }): Promise<Guild | null> {
	const { client, guildId } = params;
	const cached = client.guilds.cache.get(guildId);
	if (cached) {
		return cached;
	}
	try {
		return await client.guilds.fetch(guildId);
	} catch (error) {
		if (isUnknownResource(error) || isMissingAccess(error)) {
			return null;
		}
		throw error;
	}
}

/**
 * {@link GuildDirectory} over a discord.js client. Every lookup reads the
 * client's cache first and asks Discord only on a miss; an entity Discord does
 * not know, or a guild the bot is not in, reads as absent. Search matches a
 * case-insensitive name prefix, except the member search Discord runs itself
 * on a cache miss, and returns at most 25 entries.
 *
 * @param client - the bot's client; its caches are read, never filled by hand.
 * @returns the directory the settings service validates references with.
 */
export function createDiscordGuildDirectory(client: Client): GuildDirectory {
	return {
		async channel(guildId, id) {
			const guild = await findGuild({ client, guildId });
			if (!guild) {
				return null;
			}
			const channel =
				guild.channels.cache.get(id) ?? (await orNullWhenUnknown(guild.channels.fetch(id)));
			return channel ? toChannel(channel) : null;
		},

		async role(guildId, id) {
			const guild = await findGuild({ client, guildId });
			if (!guild) {
				return null;
			}
			const role = guild.roles.cache.get(id) ?? (await orNullWhenUnknown(guild.roles.fetch(id)));
			return role ? { id: role.id, name: role.name } : null;
		},

		async member(guildId, id) {
			const guild = await findGuild({ client, guildId });
			if (!guild) {
				return null;
			}
			const member =
				guild.members.cache.get(id) ?? (await orNullWhenUnknown(guild.members.fetch(id)));
			return member ? toMember(member) : null;
		},

		async searchChannels(guildId, query, kinds) {
			const guild = await findGuild({ client, guildId });
			if (!guild) {
				return [];
			}
			const types = kinds?.map((kind): GuildChannelType => CHANNEL_TYPE_BY_KIND[kind]);
			const channels = await searchCacheThenFetch<GuildChannelLike>({
				cached: guild.channels.cache.values(),
				fetch: async () => {
					const fetched = await guild.channels.fetch();
					return [...fetched.values()].filter((channel) => channel !== null);
				},
				matches: (channel) =>
					nameStartsWith({ name: channel.name, query }) &&
					(types === undefined || types.includes(channel.type)),
			});
			return channels.map(toChannel);
		},

		async searchRoles(guildId, query) {
			const guild = await findGuild({ client, guildId });
			if (!guild) {
				return [];
			}
			const roles = await searchCacheThenFetch({
				cached: guild.roles.cache.values(),
				fetch: async () => (await guild.roles.fetch()).values(),
				matches: (role) => nameStartsWith({ name: role.name, query }),
			});
			return roles.map((role) => ({ id: role.id, name: role.name }));
		},

		async searchMembers(guildId, query) {
			const guild = await findGuild({ client, guildId });
			if (!guild) {
				return [];
			}
			const hits = [...guild.members.cache.values()].filter((member) =>
				nameStartsWith({ name: member.displayName, query }),
			);
			if (hits.length > 0) {
				return hits.slice(0, SEARCH_LIMIT).map(toMember);
			}
			const found = await guild.members.search({ query, limit: SEARCH_LIMIT });
			return [...found.values()].map(toMember);
		},
	};
}
