import type {
	CommandInteraction,
	MessageComponentInteraction,
	ModalSubmitInteraction,
} from "discord.js";
import { renderView } from "@/discord/view/render-view";
import type { View } from "@/discord/view/view";
import { errorMessage } from "@/errors/error-message";
import type { Logger } from "@/logger";

/** Every interaction a view can answer: commands, components and modal submissions. */
type AnswerableInteraction =
	| CommandInteraction
	| MessageComponentInteraction
	| ModalSubmitInteraction;

/**
 * Render the view for the send kind the interaction's state calls for, and
 * return the send itself: rendering throws here, outside the delivery's catch.
 */
function renderDelivery(
	interaction: AnswerableInteraction,
	view: View,
	ephemeral: boolean,
): () => Promise<unknown> {
	if (interaction.deferred && "commandName" in interaction) {
		const payload = renderView(view, {});
		return () => interaction.editReply(payload);
	}
	const payload = renderView(view, { ephemeral });
	if (interaction.deferred || interaction.replied) {
		return () => interaction.followUp(payload);
	}
	return () => interaction.reply(payload);
}

/**
 * Deliver a view, in either layout, regardless of the interaction's lifecycle
 * state. A view that cannot render (over a limit, a missing attachment) throws
 * before anything is sent: that is the author's bug. A failed delivery (e.g. an
 * expired/unknown interaction, code 10062) is logged instead, so it never
 * escapes a handler and reaches the client's unhandled `error` event.
 *
 * Visibility on a deferred command is fixed at deferReply time, so editReply
 * carries no `Ephemeral` flag; its V2 flag is still stated, since deferring
 * cannot carry it. It needs no `content: null`: the deferred placeholder holds
 * no content to clear. Deferred components and modals use followUp because
 * their acknowledgement may have been deferUpdate.
 *
 * @param interaction - Any interaction that can be answered.
 * @param view - What the answer shows.
 * @param options - Whether a reply or follow-up is ephemeral.
 * @param logger - Where a failed delivery is reported.
 * @returns Resolves once the answer is sent or its failure logged.
 * @throws {EmptyViewError | ViewLimitError | MissingAttachmentError} From `renderView`, before any send.
 */
export async function sendView(
	interaction: AnswerableInteraction,
	view: View,
	options: { readonly ephemeral: boolean },
	logger: Logger,
): Promise<void> {
	const deliver = renderDelivery(interaction, view, options.ephemeral);
	try {
		await deliver();
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
