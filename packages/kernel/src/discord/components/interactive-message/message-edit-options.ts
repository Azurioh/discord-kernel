import type { Attachment, InteractionUpdateOptions } from "discord.js";
import type { InteractiveMessagePayload } from "@/discord/components/interactive-message/interactive-message-collector";
import { planMessageAttachments } from "@/discord/ui/message-attachments";

/**
 * The payload as discord.js takes it on an edit, given what the message already
 * carries: a file already up there under a wanted name is kept rather than
 * uploaded a second time, so an unrelated re-render neither drops nor re-sends
 * it.
 *
 * A payload stating no files touches neither field, leaving the message's own
 * attachments alone.
 *
 * `state` is only read for a `"card"` payload — it is what `Card.apply` needs
 * to render the container — and is otherwise unused. No caller building an
 * `"embeds"` payload has ever had to pass it, and still does not: it is the
 * third, optional parameter existing two-argument calls already omit.
 */
export function toMessageEditOptions<S>(
	payload: InteractiveMessagePayload<S>,
	existing: readonly Attachment[],
	state?: S,
): InteractionUpdateOptions {
	const { files, allowedMentions } = payload;
	const mentions = allowedMentions === undefined ? {} : { allowedMentions };
	const attachments = files === undefined ? {} : planMessageAttachments(existing, files);

	if (payload.layout === "card") {
		if (state === undefined) {
			// Only reachable once a caller actually builds a `"card"` payload
			// without threading the state its `Card` needs — a programming error
			// in that caller, not something a member's click can trigger.
			throw new Error(
				'toMessageEditOptions: a "card" layout payload needs the state its Card was ' +
					"declared over to call Card.apply, and none was given.",
			);
		}
		return {
			components: [payload.card.apply(state, false), ...(payload.controls ?? [])],
			...mentions,
			...attachments,
		};
	}

	const { embeds, components } = payload;
	return { embeds, components, ...mentions, ...attachments };
}
