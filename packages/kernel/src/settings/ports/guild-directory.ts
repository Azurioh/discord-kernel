/**
 * Vendor-free channel category a channel field can be restricted to. Each
 * member maps one to one to a guild channel type of Discord's `ChannelType`.
 */
export type ChannelKind =
	/** `ChannelType.GuildText` */
	| "text"
	/** `ChannelType.GuildVoice` */
	| "voice"
	/** `ChannelType.GuildCategory` */
	| "category"
	/** `ChannelType.GuildAnnouncement` */
	| "announcement"
	/** `ChannelType.AnnouncementThread` */
	| "announcementThread"
	/** `ChannelType.PublicThread` */
	| "publicThread"
	/** `ChannelType.PrivateThread` */
	| "privateThread"
	/** `ChannelType.GuildStageVoice` */
	| "stage"
	/** `ChannelType.GuildDirectory` */
	| "directory"
	/** `ChannelType.GuildForum` */
	| "forum"
	/** `ChannelType.GuildMedia` */
	| "media";

/**
 * Read-only view of a guild's channels, roles and members. Settings logic uses
 * it to check that a referenced entity exists and to suggest candidates,
 * without depending on discord.js.
 */
export interface GuildDirectory {
	channel(
		guildId: string,
		id: string,
	): Promise<{ id: string; name: string; kind: ChannelKind } | null>;
	role(guildId: string, id: string): Promise<{ id: string; name: string } | null>;
	member(guildId: string, id: string): Promise<{ id: string; name: string } | null>;
	searchChannels(
		guildId: string,
		query: string,
		kinds?: readonly ChannelKind[],
	): Promise<readonly { id: string; name: string; kind: ChannelKind }[]>;
	searchRoles(guildId: string, query: string): Promise<readonly { id: string; name: string }[]>;
	searchMembers(guildId: string, query: string): Promise<readonly { id: string; name: string }[]>;
}
