/**
 * Port for handing a channel to whatever export/archive pipeline is wired up at
 * the composition root, before the channel is otherwise disposed of.
 *
 * This is the seam that lets one feature use another's capability without
 * importing it: a module that closes channels can ask for the content to be
 * archived first, while knowing nothing about who archives it — or whether
 * anyone does. The composition root decides what implements this, exactly as it
 * does for `Logger` and `DatabaseConnection`.
 */
export interface ChannelExportOptions {
	/** A caller-chosen base name (no extension) for the produced archive file. */
	readonly fileName?: string;
}

/**
 * Where one export actually ended up.
 *
 * Reported rather than assumed, because a caller usually has to tell the person
 * who triggered the export where to find the result — and because an
 * implementation may have a preferred destination it could not reach. The two
 * destinations are deliberately coarse: `discord`, meaning the archive was
 * posted as a message attachment, and `cloud`, meaning it was uploaded
 * somewhere and only a link came back.
 */
export interface ChannelExportOutcome {
	readonly destinationUsed: "discord" | "cloud";
	/** True when cloud delivery was configured, failed, and Discord took over. */
	readonly fellBackFromCloud: boolean;
	readonly cloudUrl?: string;
}

export interface ChannelExporter {
	/**
	 * Export `channelId`'s content and deliver the result.
	 *
	 * `deliverToChannelId` is where a Discord-delivered archive is posted — also
	 * the fallback when cloud delivery is configured but fails. `guildId` is what
	 * an implementation resolves that guild's destination preference from, so the
	 * caller does not have to know one exists.
	 */
	exportChannel(
		channelId: string,
		deliverToChannelId: string,
		guildId: string,
		options?: ChannelExportOptions,
	): Promise<ChannelExportOutcome>;
}
