import { describe, expect, expectTypeOf, it } from "vitest";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import type { ChannelKind } from "@/settings/ports/guild-directory";

const GUILD = "100000000000000001";
const OTHER_GUILD = "100000000000000002";

const directory = createInMemoryGuildDirectory({
	[GUILD]: {
		channels: [
			{ id: "1", name: "general", kind: "text" },
			{ id: "2", name: "General Voice", kind: "voice" },
			{ id: "3", name: "Tickets", kind: "category" },
			{ id: "4", name: "games", kind: "text" },
		],
		roles: [
			{ id: "10", name: "Moderator" },
			{ id: "11", name: "member" },
		],
		members: [
			{ id: "20", name: "Alice" },
			{ id: "21", name: "alfred" },
			{ id: "22", name: "Bob" },
		],
	},
	[OTHER_GUILD]: {},
});

describe("createInMemoryGuildDirectory", () => {
	describe("lookup by id", () => {
		it("returns the channel, role or member with that id", async () => {
			expect(await directory.channel(GUILD, "3")).toEqual({
				id: "3",
				name: "Tickets",
				kind: "category",
			});
			expect(await directory.role(GUILD, "10")).toEqual({ id: "10", name: "Moderator" });
			expect(await directory.member(GUILD, "22")).toEqual({ id: "22", name: "Bob" });
		});

		it("returns null for an unknown id", async () => {
			expect(await directory.channel(GUILD, "999")).toBeNull();
			expect(await directory.role(GUILD, "999")).toBeNull();
			expect(await directory.member(GUILD, "999")).toBeNull();
		});

		it("does not see another guild's entities", async () => {
			expect(await directory.channel(OTHER_GUILD, "1")).toBeNull();
			expect(await directory.role(OTHER_GUILD, "10")).toBeNull();
			expect(await directory.member(OTHER_GUILD, "20")).toBeNull();
		});

		it("returns null for an unknown guild", async () => {
			expect(await directory.channel("unknown", "1")).toBeNull();
		});
	});

	describe("search", () => {
		it("matches a name prefix regardless of case", async () => {
			expect(await directory.searchChannels(GUILD, "GEN")).toEqual([
				{ id: "1", name: "general", kind: "text" },
				{ id: "2", name: "General Voice", kind: "voice" },
			]);
			expect(await directory.searchRoles(GUILD, "mod")).toEqual([{ id: "10", name: "Moderator" }]);
			expect(await directory.searchMembers(GUILD, "al")).toEqual([
				{ id: "20", name: "Alice" },
				{ id: "21", name: "alfred" },
			]);
		});

		it("does not match inside a name", async () => {
			expect(await directory.searchChannels(GUILD, "eral")).toEqual([]);
		});

		it("returns every entity for an empty query", async () => {
			expect(await directory.searchRoles(GUILD, "")).toHaveLength(2);
		});

		it("keeps only the requested channel kinds", async () => {
			expect(await directory.searchChannels(GUILD, "g", ["text"])).toEqual([
				{ id: "1", name: "general", kind: "text" },
				{ id: "4", name: "games", kind: "text" },
			]);
			expect(await directory.searchChannels(GUILD, "", ["category", "voice"])).toEqual([
				{ id: "2", name: "General Voice", kind: "voice" },
				{ id: "3", name: "Tickets", kind: "category" },
			]);
		});

		it("tells the three thread kinds apart", async () => {
			const threads = createInMemoryGuildDirectory({
				[GUILD]: {
					channels: [
						{ id: "30", name: "news-thread", kind: "announcementThread" },
						{ id: "31", name: "open-thread", kind: "publicThread" },
						{ id: "32", name: "staff-thread", kind: "privateThread" },
					],
				},
			});

			expect(await threads.searchChannels(GUILD, "", ["publicThread", "privateThread"])).toEqual([
				{ id: "31", name: "open-thread", kind: "publicThread" },
				{ id: "32", name: "staff-thread", kind: "privateThread" },
			]);
		});

		it("returns nothing for a guild without seeded entities", async () => {
			expect(await directory.searchChannels(OTHER_GUILD, "")).toEqual([]);
			expect(await directory.searchMembers("unknown", "")).toEqual([]);
		});
	});
});

describe("ChannelKind", () => {
	it("mirrors the guild channel types of Discord one to one", () => {
		expectTypeOf<ChannelKind>().toEqualTypeOf<
			| "text"
			| "voice"
			| "category"
			| "announcement"
			| "announcementThread"
			| "publicThread"
			| "privateThread"
			| "stage"
			| "directory"
			| "forum"
			| "media"
		>();
	});
});
