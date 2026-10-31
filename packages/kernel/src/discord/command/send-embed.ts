import {
	type CommandInteraction,
	type EmbedBuilder,
	type MessageComponentInteraction,
	MessageFlags,
	type ModalSubmitInteraction,
} from "discord.js";
import { errorMessage } from "@/errors/error-message";
import type { Logger } from "@/logger";

/**
 * Deliver an embed regardless of the interaction's lifecycle state, and never
 * throw: a failed delivery (e.g. an expired/unknown interaction, code 10062)
 * must not escape a handler and reach the client's unhandled `error` event,
 * which would crash the process. Visibility on a deferred interaction is fixed
 * at deferReply time, so editReply carries no flags.
 *
 * Accepts commands, components and modal submissions so every reply pipeline
 * uses the same delivery and error-handling behavior.
 */
export async function sendEmbed(
	interaction: CommandInteraction | MessageComponentInteraction | ModalSubmitInteraction,
	embed: EmbedBuilder,
	ephemeral: boolean,
	logger: Logger,
): Promise<void> {
	const flags = ephemeral ? MessageFlags.Ephemeral : undefined;
	try {
		if (interaction.deferred) {
			await interaction.editReply({ embeds: [embed] });
			return;
		}
		if (interaction.replied) {
			await interaction.followUp({ embeds: [embed], flags });
			return;
		}
		await interaction.reply({ embeds: [embed], flags });
	} catch (error) {
		logger.error(
			{
				commandName: "commandName" in interaction ? interaction.commandName : undefined,
				interactionId: interaction.id,
				err: errorMessage(error),
			},
			"Failed to deliver interaction response",
		);
	}
}
