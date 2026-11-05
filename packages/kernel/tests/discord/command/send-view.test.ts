import { ContainerBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { describe, expect, it } from "vitest";
import { sendView } from "@/discord/command/send-view";
import type { View } from "@/discord/view/view";
import { ViewLimitError } from "@/discord/view/view-errors";
import { MAX_MESSAGE_EMBEDS } from "@/discord/view/view-limits";
import { createBotInteraction } from "../../support/bot-interaction";
import { createFakeLogger } from "../../support/fake-logger";

const EMBED = new EmbedBuilder().setDescription("denied");
const V1: View = { embeds: [EMBED] };
const V2: View = {
	components: [{ type: "container", children: [{ type: "text", content: "hi" }] }],
};

type Kind = "button" | "modal" | "slash";
type State = "fresh" | "deferred" | "replied";

/** A fixture in the given state; components and modals carry no `commandName`, as in discord.js. */
function interaction(kind: Kind, state: State = "fresh") {
	const target = createBotInteraction({ kind, name: "test", guildId: "guild" });
	if (kind !== "slash") {
		Reflect.deleteProperty(target, "commandName");
	}
	target.deferred = state === "deferred";
	target.replied = state === "replied";
	return target;
}

describe("sendView", () => {
	it.each(["button", "modal"] as const)(
		"follows up ephemerally after deferUpdate on a %s without editing its source",
		async (kind) => {
			const target = interaction(kind, "deferred");
			await sendView(target as never, V1, { ephemeral: true }, createFakeLogger());
			expect(target.followUp).toHaveBeenCalledExactlyOnceWith({
				embeds: [EMBED],
				components: [],
				flags: [MessageFlags.Ephemeral],
			});
			expect(target.editReply).not.toHaveBeenCalled();
			expect(target.reply).not.toHaveBeenCalled();
		},
	);

	it.each(["button", "modal"] as const)("replies ephemerally to a fresh %s", async (kind) => {
		const target = interaction(kind);
		await sendView(target as never, V1, { ephemeral: true }, createFakeLogger());
		expect(target.reply).toHaveBeenCalledExactlyOnceWith({
			embeds: [EMBED],
			components: [],
			flags: [MessageFlags.Ephemeral],
		});
		expect(target.editReply).not.toHaveBeenCalled();
		expect(target.followUp).not.toHaveBeenCalled();
	});

	it.each(["button", "modal"] as const)("follows up ephemerally on a replied %s", async (kind) => {
		const target = interaction(kind, "replied");
		await sendView(target as never, V1, { ephemeral: true }, createFakeLogger());
		expect(target.followUp).toHaveBeenCalledExactlyOnceWith({
			embeds: [EMBED],
			components: [],
			flags: [MessageFlags.Ephemeral],
		});
		expect(target.editReply).not.toHaveBeenCalled();
	});

	it("edits a command reply after deferReply, without flags or a content reset", async () => {
		const target = interaction("slash", "deferred");
		await sendView(target as never, V1, { ephemeral: true }, createFakeLogger());
		// Visibility was fixed by deferReply, and the deferred placeholder has no content to clear.
		expect(target.editReply).toHaveBeenCalledExactlyOnceWith({ embeds: [EMBED], components: [] });
		expect(target.followUp).not.toHaveBeenCalled();
		expect(target.reply).not.toHaveBeenCalled();
	});

	it.each([
		{ state: "fresh", method: "reply" },
		{ state: "deferred", method: "editReply" },
		{ state: "replied", method: "followUp" },
	] as const)("sends a V1 command reply through $method when $state", async ({ state, method }) => {
		const target = interaction("slash", state);
		await sendView(
			target as never,
			{ content: "hello", ...V1 },
			{ ephemeral: false },
			createFakeLogger(),
		);
		expect(target.sentPayloads()).toEqual([
			{ method, payload: { content: "hello", embeds: [EMBED], components: [] } },
		]);
	});

	it.each([
		{ state: "fresh", method: "reply", ephemeral: true },
		{ state: "fresh", method: "reply", ephemeral: false },
		{ state: "deferred", method: "editReply", ephemeral: true },
		{ state: "deferred", method: "editReply", ephemeral: false },
		{ state: "replied", method: "followUp", ephemeral: true },
		{ state: "replied", method: "followUp", ephemeral: false },
	] as const)(
		"flags a V2 command reply sent through $method (ephemeral: $ephemeral)",
		async ({ state, method, ephemeral }) => {
			const target = interaction("slash", state);
			await sendView(target as never, V2, { ephemeral }, createFakeLogger());
			const flags =
				ephemeral && method !== "editReply"
					? [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
					: [MessageFlags.IsComponentsV2];
			const sent = target.sentPayloads();
			expect(sent).toEqual([
				{ method, payload: { components: [expect.any(ContainerBuilder)], flags } },
			]);
			expect(sent[0]?.payload).not.toHaveProperty("content");
			expect(sent[0]?.payload).not.toHaveProperty("embeds");
		},
	);

	it("rejects a view over a limit before any send, without swallowing the error", async () => {
		const target = interaction("slash");
		const logger = createFakeLogger();
		const tooMany = Array.from({ length: MAX_MESSAGE_EMBEDS + 1 }, () => EMBED);
		await expect(
			sendView(target as never, { embeds: tooMany }, { ephemeral: true }, logger),
		).rejects.toBeInstanceOf(ViewLimitError);
		expect(target.sentPayloads()).toEqual([]);
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("logs a failed delivery instead of throwing", async () => {
		const target = interaction("slash");
		target.reply.mockRejectedValueOnce(new Error("Unknown interaction"));
		const logger = createFakeLogger();
		await expect(
			sendView(target as never, V1, { ephemeral: true }, logger),
		).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalledExactlyOnceWith(
			{ commandName: "test", interactionId: target.id, err: "Unknown interaction" },
			"Failed to deliver interaction response",
		);
	});
});
