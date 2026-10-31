import { EmbedBuilder, MessageFlags } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { sendEmbed } from "@/discord/command/send-embed";
import { createBotInteraction } from "../../support/bot-interaction";
import { createFakeLogger } from "../../support/fake-logger";

const EMBED = new EmbedBuilder().setDescription("denied");

function interaction(params: {
	kind: "button" | "modal" | "slash";
	deferred: boolean;
	replied: boolean;
}) {
	const base = createBotInteraction({ kind: params.kind, name: "test", guildId: "guild" });
	const { commandName, ...component } = base;
	return {
		...component,
		...(params.kind === "slash" ? { commandName } : {}),
		deferred: params.deferred,
		replied: params.replied,
		editReply: vi.fn(),
		followUp: vi.fn(),
	};
}

describe("sendEmbed", () => {
	it.each(["button", "modal"] as const)(
		"follows up ephemerally after deferUpdate on a %s without editing its source",
		async (kind) => {
			const target = interaction({ kind, deferred: true, replied: false });
			await sendEmbed(target as never, EMBED, true, createFakeLogger());
			expect(target.followUp).toHaveBeenCalledExactlyOnceWith({
				embeds: [EMBED],
				flags: MessageFlags.Ephemeral,
			});
			expect(target.editReply).not.toHaveBeenCalled();
			expect(target.reply).not.toHaveBeenCalled();
		},
	);
	it.each(["button", "modal"] as const)("replies ephemerally to a fresh %s", async (kind) => {
		const target = interaction({ kind, deferred: false, replied: false });
		await sendEmbed(target as never, EMBED, true, createFakeLogger());
		expect(target.reply).toHaveBeenCalledExactlyOnceWith({
			embeds: [EMBED],
			flags: MessageFlags.Ephemeral,
		});
		expect(target.editReply).not.toHaveBeenCalled();
		expect(target.followUp).not.toHaveBeenCalled();
	});
	it.each(["button", "modal"] as const)("follows up ephemerally on a replied %s", async (kind) => {
		const target = interaction({ kind, deferred: false, replied: true });
		await sendEmbed(target as never, EMBED, true, createFakeLogger());
		expect(target.followUp).toHaveBeenCalledExactlyOnceWith({
			embeds: [EMBED],
			flags: MessageFlags.Ephemeral,
		});
		expect(target.editReply).not.toHaveBeenCalled();
	});
	it("edits a command reply after deferReply", async () => {
		const target = interaction({ kind: "slash", deferred: true, replied: false });
		await sendEmbed(target as never, EMBED, true, createFakeLogger());
		expect(target.editReply).toHaveBeenCalledExactlyOnceWith({ embeds: [EMBED] });
		expect(target.followUp).not.toHaveBeenCalled();
		expect(target.reply).not.toHaveBeenCalled();
	});
});
