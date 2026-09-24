import {
	ChannelType,
	type Client,
	Collection,
	DiscordAPIError,
	RESTJSONErrorCodes,
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { createDiscordGuildDirectory } from "@/discord/settings/discord-guild-directory";
import type { ChannelKind } from "@/settings/ports/guild-directory";

const GUILD_ID = "100";
const NOT_FOUND_STATUS = 404;
const FORBIDDEN_STATUS = 403;

interface FakeChannel {
	readonly id: string;
	readonly name: string;
	readonly type: ChannelType;
}

interface FakeRole {
	readonly id: string;
	readonly name: string;
}

interface FakeMember {
	readonly id: string;
	readonly displayName: string;
}

interface FakeGuildSeed {
	readonly channels?: readonly FakeChannel[];
	readonly roles?: readonly FakeRole[];
	readonly members?: readonly FakeMember[];
}

/** Build a real REST error: the adapter narrows with `instanceof`, not duck typing. */
function createApiError(code: number, status: number): DiscordAPIError {
	return new DiscordAPIError({ code, message: "Test error" }, code, status, "GET", "/test", {});
}

function collectionOf<T extends { id: string }>(items: readonly T[]): Collection<string, T> {
	return new Collection(items.map((item) => [item.id, item]));
}

/**
 * A stand-in for a discord.js guild: `cached` entities sit in the managers'
 * caches, `remote` ones are only reachable through the managers' `fetch`.
 */
function createFakeGuild(cached: FakeGuildSeed, remote: FakeGuildSeed = {}) {
	const unknown = (code: number) => Promise.reject(createApiError(code, NOT_FOUND_STATUS));
	return {
		id: GUILD_ID,
		channels: {
			cache: collectionOf(cached.channels ?? []),
			fetch: vi.fn((id?: string) => {
				if (id === undefined) {
					return Promise.resolve(
						collectionOf([...(cached.channels ?? []), ...(remote.channels ?? [])]),
					);
				}
				const channel = remote.channels?.find((candidate) => candidate.id === id);
				return channel ? Promise.resolve(channel) : unknown(RESTJSONErrorCodes.UnknownChannel);
			}),
		},
		roles: {
			cache: collectionOf(cached.roles ?? []),
			fetch: vi.fn((id?: string) => {
				if (id === undefined) {
					return Promise.resolve(collectionOf([...(cached.roles ?? []), ...(remote.roles ?? [])]));
				}
				return Promise.resolve(remote.roles?.find((candidate) => candidate.id === id) ?? null);
			}),
		},
		members: {
			cache: collectionOf(cached.members ?? []),
			fetch: vi.fn((id: string) => {
				const member = remote.members?.find((candidate) => candidate.id === id);
				return member ? Promise.resolve(member) : unknown(RESTJSONErrorCodes.UnknownMember);
			}),
			search: vi.fn(({ query }: { query: string; limit: number }) =>
				Promise.resolve(
					collectionOf(
						(remote.members ?? []).filter((member) =>
							member.displayName.toLowerCase().startsWith(query.toLowerCase()),
						),
					),
				),
			),
		},
	};
}

type FakeGuild = ReturnType<typeof createFakeGuild>;

/** A client whose guild cache holds `guild`, or none; `fetchGuild` answers a cache miss. */
function createFakeClient(guild: FakeGuild | null, fetchGuild?: () => Promise<FakeGuild>) {
	const fetch = vi.fn(
		fetchGuild ??
			(() => Promise.reject(createApiError(RESTJSONErrorCodes.UnknownGuild, NOT_FOUND_STATUS))),
	);
	const client = {
		guilds: { cache: collectionOf(guild ? [guild] : []), fetch },
	} as unknown as Client;
	return { client, fetchGuild: fetch };
}

const KIND_BY_TYPE: readonly (readonly [ChannelType, ChannelKind])[] = [
	[ChannelType.GuildText, "text"],
	[ChannelType.GuildVoice, "voice"],
	[ChannelType.GuildCategory, "category"],
	[ChannelType.GuildAnnouncement, "announcement"],
	[ChannelType.AnnouncementThread, "announcementThread"],
	[ChannelType.PublicThread, "publicThread"],
	[ChannelType.PrivateThread, "privateThread"],
	[ChannelType.GuildStageVoice, "stage"],
	[ChannelType.GuildDirectory, "directory"],
	[ChannelType.GuildForum, "forum"],
	[ChannelType.GuildMedia, "media"],
];

describe("createDiscordGuildDirectory", () => {
	describe("channel", () => {
		it.each(KIND_BY_TYPE)("maps channel type %s to kind %s", async (type, kind) => {
			const guild = createFakeGuild({ channels: [{ id: "1", name: "c", type }] });
			const directory = createDiscordGuildDirectory(createFakeClient(guild).client);

			await expect(directory.channel(GUILD_ID, "1")).resolves.toEqual({ id: "1", name: "c", kind });
		});

		it("answers from the cache without fetching", async () => {
			const guild = createFakeGuild({
				channels: [{ id: "1", name: "general", type: ChannelType.GuildText }],
			});
			const directory = createDiscordGuildDirectory(createFakeClient(guild).client);

			await directory.channel(GUILD_ID, "1");

			expect(guild.channels.fetch).not.toHaveBeenCalled();
		});

		it("fetches a channel missing from the cache", async () => {
			const guild = createFakeGuild(
				{},
				{ channels: [{ id: "2", name: "old-thread", type: ChannelType.PublicThread }] },
			);
			const directory = createDiscordGuildDirectory(createFakeClient(guild).client);

			await expect(directory.channel(GUILD_ID, "2")).resolves.toEqual({
				id: "2",
				name: "old-thread",
				kind: "publicThread",
			});
			expect(guild.channels.fetch).toHaveBeenCalledWith("2");
		});

		it("answers null for a channel Discord does not know", async () => {
			const directory = createDiscordGuildDirectory(createFakeClient(createFakeGuild({})).client);

			await expect(directory.channel(GUILD_ID, "404")).resolves.toBeNull();
		});

		it("fetches a guild missing from the cache", async () => {
			const guild = createFakeGuild({
				channels: [{ id: "1", name: "general", type: ChannelType.GuildText }],
			});
			const { client, fetchGuild } = createFakeClient(null, () => Promise.resolve(guild));
			const directory = createDiscordGuildDirectory(client);

			await expect(directory.channel(GUILD_ID, "1")).resolves.toMatchObject({ id: "1" });
			expect(fetchGuild).toHaveBeenCalledWith(GUILD_ID);
		});

		it("answers null in a guild Discord does not know", async () => {
			const directory = createDiscordGuildDirectory(createFakeClient(null).client);

			await expect(directory.channel(GUILD_ID, "1")).resolves.toBeNull();
		});

		it("answers null in a guild the bot cannot access", async () => {
			const { client } = createFakeClient(null, () =>
				Promise.reject(createApiError(RESTJSONErrorCodes.MissingAccess, FORBIDDEN_STATUS)),
			);

			await expect(createDiscordGuildDirectory(client).channel(GUILD_ID, "1")).resolves.toBeNull();
		});

		it("lets any other failure through", async () => {
			const failure = new Error("gateway down");
			const { client } = createFakeClient(null, () => Promise.reject(failure));

			await expect(createDiscordGuildDirectory(client).channel(GUILD_ID, "1")).rejects.toBe(
				failure,
			);
		});
	});

	describe("role", () => {
		it("answers from the cache without fetching", async () => {
			const guild = createFakeGuild({ roles: [{ id: "10", name: "Admin" }] });
			const directory = createDiscordGuildDirectory(createFakeClient(guild).client);

			await expect(directory.role(GUILD_ID, "10")).resolves.toEqual({ id: "10", name: "Admin" });
			expect(guild.roles.fetch).not.toHaveBeenCalled();
		});

		it("fetches a role missing from the cache, null when Discord does not know it", async () => {
			const guild = createFakeGuild({}, { roles: [{ id: "11", name: "Mod" }] });
			const directory = createDiscordGuildDirectory(createFakeClient(guild).client);

			await expect(directory.role(GUILD_ID, "11")).resolves.toEqual({ id: "11", name: "Mod" });
			await expect(directory.role(GUILD_ID, "12")).resolves.toBeNull();
		});
	});

	describe("member", () => {
		it("answers from the cache with the display name", async () => {
			const guild = createFakeGuild({ members: [{ id: "20", displayName: "Alice" }] });
			const directory = createDiscordGuildDirectory(createFakeClient(guild).client);

			await expect(directory.member(GUILD_ID, "20")).resolves.toEqual({ id: "20", name: "Alice" });
			expect(guild.members.fetch).not.toHaveBeenCalled();
		});

		it("fetches a member missing from the cache, null when not in the guild", async () => {
			const guild = createFakeGuild({}, { members: [{ id: "21", displayName: "Bob" }] });
			const directory = createDiscordGuildDirectory(createFakeClient(guild).client);

			await expect(directory.member(GUILD_ID, "21")).resolves.toEqual({ id: "21", name: "Bob" });
			await expect(directory.member(GUILD_ID, "22")).resolves.toBeNull();
		});
	});

	describe("searchChannels", () => {
		const channels: FakeChannel[] = [
			{ id: "1", name: "General", type: ChannelType.GuildText },
			{ id: "2", name: "games", type: ChannelType.GuildVoice },
			{ id: "3", name: "logs", type: ChannelType.GuildText },
		];

		it("matches a case-insensitive name prefix in the cache", async () => {
			const guild = createFakeGuild({ channels });
			const directory = createDiscordGuildDirectory(createFakeClient(guild).client);

			await expect(directory.searchChannels(GUILD_ID, "g")).resolves.toEqual([
				{ id: "1", name: "General", kind: "text" },
				{ id: "2", name: "games", kind: "voice" },
			]);
			expect(guild.channels.fetch).not.toHaveBeenCalled();
		});

		it("keeps only the requested kinds", async () => {
			const directory = createDiscordGuildDirectory(
				createFakeClient(createFakeGuild({ channels })).client,
			);

			await expect(directory.searchChannels(GUILD_ID, "g", ["voice"])).resolves.toEqual([
				{ id: "2", name: "games", kind: "voice" },
			]);
		});

		it("fetches the guild's channels when the cache has no match", async () => {
			const guild = createFakeGuild(
				{ channels },
				{ channels: [{ id: "4", name: "rules", type: ChannelType.GuildText }] },
			);
			const directory = createDiscordGuildDirectory(createFakeClient(guild).client);

			await expect(directory.searchChannels(GUILD_ID, "ru")).resolves.toEqual([
				{ id: "4", name: "rules", kind: "text" },
			]);
		});

		it("answers nothing in a guild Discord does not know", async () => {
			const directory = createDiscordGuildDirectory(createFakeClient(null).client);

			await expect(directory.searchChannels(GUILD_ID, "g")).resolves.toEqual([]);
		});

		it("returns at most 25 matches", async () => {
			const many = Array.from({ length: 30 }, (_, index) => ({
				id: String(index),
				name: `chan-${index}`,
				type: ChannelType.GuildText,
			}));
			const directory = createDiscordGuildDirectory(
				createFakeClient(createFakeGuild({ channels: many })).client,
			);

			await expect(directory.searchChannels(GUILD_ID, "chan")).resolves.toHaveLength(25);
		});
	});

	describe("searchRoles", () => {
		it("matches in the cache, then fetches the guild's roles when nothing matches", async () => {
			const guild = createFakeGuild(
				{ roles: [{ id: "10", name: "Admin" }] },
				{ roles: [{ id: "11", name: "Moderator" }] },
			);
			const directory = createDiscordGuildDirectory(createFakeClient(guild).client);

			await expect(directory.searchRoles(GUILD_ID, "ad")).resolves.toEqual([
				{ id: "10", name: "Admin" },
			]);
			expect(guild.roles.fetch).not.toHaveBeenCalled();
			await expect(directory.searchRoles(GUILD_ID, "mod")).resolves.toEqual([
				{ id: "11", name: "Moderator" },
			]);
		});
	});

	describe("searchMembers", () => {
		it("matches in the cache, then asks Discord's member search when nothing matches", async () => {
			const guild = createFakeGuild(
				{ members: [{ id: "20", displayName: "Alice" }] },
				{ members: [{ id: "21", displayName: "Bob" }] },
			);
			const directory = createDiscordGuildDirectory(createFakeClient(guild).client);

			await expect(directory.searchMembers(GUILD_ID, "al")).resolves.toEqual([
				{ id: "20", name: "Alice" },
			]);
			expect(guild.members.search).not.toHaveBeenCalled();
			await expect(directory.searchMembers(GUILD_ID, "bo")).resolves.toEqual([
				{ id: "21", name: "Bob" },
			]);
			expect(guild.members.search).toHaveBeenCalledWith({ query: "bo", limit: 25 });
		});
	});
});
