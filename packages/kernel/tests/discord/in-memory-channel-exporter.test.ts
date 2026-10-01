import { describe, expect, it } from "vitest";
import { createInMemoryChannelExporter } from "@/discord/in-memory-channel-exporter";

describe("createInMemoryChannelExporter", () => {
	it("resolves a Discord delivery by default", async () => {
		const exporter = createInMemoryChannelExporter();

		await expect(exporter.exportChannel("channel", "archive", "guild")).resolves.toEqual({
			destinationUsed: "discord",
			fellBackFromCloud: false,
		});
	});

	it("resolves the configured outcome", async () => {
		const outcome = {
			destinationUsed: "cloud" as const,
			fellBackFromCloud: false,
			cloudUrl: "https://example.com/archive.zip",
		};
		const exporter = createInMemoryChannelExporter(outcome);

		await expect(exporter.exportChannel("channel", "archive", "guild")).resolves.toEqual(outcome);
	});

	it("records every call with its arguments, in order", async () => {
		const exporter = createInMemoryChannelExporter();

		await exporter.exportChannel("first", "archive", "guild");
		await exporter.exportChannel("second", "archive", "guild", { fileName: "ticket-42" });

		expect(exporter.exports).toEqual([
			{ channelId: "first", deliverToChannelId: "archive", guildId: "guild" },
			{
				channelId: "second",
				deliverToChannelId: "archive",
				guildId: "guild",
				options: { fileName: "ticket-42" },
			},
		]);
	});
});
