import type {
	ChannelExporter,
	ChannelExportOptions,
	ChannelExportOutcome,
} from "@/discord/channel-exporter";

/** One {@link ChannelExporter.exportChannel} call, as an {@link InMemoryChannelExporter} recorded it. */
export interface RecordedChannelExport {
	readonly channelId: string;
	readonly deliverToChannelId: string;
	readonly guildId: string;
	readonly options?: ChannelExportOptions;
}

/** A {@link ChannelExporter} that exports nothing and records every call. */
export interface InMemoryChannelExporter extends ChannelExporter {
	readonly exports: readonly RecordedChannelExport[];
}

const DISCORD_DELIVERY: ChannelExportOutcome = {
	destinationUsed: "discord",
	fellBackFromCloud: false,
};

/**
 * The in-memory twin of {@link ChannelExporter}.
 *
 * @param outcome - what every call resolves; a Discord delivery by default.
 */
export function createInMemoryChannelExporter(
	outcome: ChannelExportOutcome = DISCORD_DELIVERY,
): InMemoryChannelExporter {
	const exports: RecordedChannelExport[] = [];

	return {
		exports,
		async exportChannel(channelId, deliverToChannelId, guildId, options) {
			exports.push(
				options === undefined
					? { channelId, deliverToChannelId, guildId }
					: { channelId, deliverToChannelId, guildId, options },
			);
			return { ...outcome };
		},
	};
}
