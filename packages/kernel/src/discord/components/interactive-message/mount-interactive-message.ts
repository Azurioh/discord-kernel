import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import {
	COLLECTOR_IDLE_MS,
	type InteractiveMessageHandle,
	type InteractiveSelect,
	type InteractiveView,
	mountInteractiveMessageCollector,
} from "@/discord/components/interactive-message/interactive-message-collector";
import { toMessageEditOptions } from "@/discord/components/interactive-message/message-edit-options";
import {
	createStateStore,
	type StateStore,
} from "@/discord/components/interactive-message/state-store";
import type { Button } from "@/discord/interaction/button";
import type { Logger } from "@/logger";

export interface InteractiveMessageOptions<S> {
	initialState: S;
	buttons: Button<S>[];
	/** Omitted by a message whose controls are all buttons. */
	selects?: InteractiveSelect<S>[];
	view: InteractiveView<S>;
	ownerId: string;
	/** Run once the message stops reacting, whichever way it ended. */
	onEnd?: () => Promise<void> | void;
	logger: Logger;
	idleMs?: number;
}

/**
 * Send an interactive message and keep its controls live for a bounded time:
 * renders the initial state, then hands the message to the collector.
 *
 * Callers that have already sent their message — or that decide case by case
 * whether it is worth collecting at all — use
 * {@link mountInteractiveMessageCollector} directly.
 *
 * Call it on an already-deferred interaction.
 */
export async function mountInteractiveMessage<S>(
	interaction: ChatInputCommandInteraction,
	options: InteractiveMessageOptions<S>,
): Promise<InteractiveMessageHandle & { readonly store: StateStore<S> }> {
	const store = createStateStore(options.initialState);
	const initial = options.view.render(store.read());
	// A deferred reply carries no attachment yet, so every file the first render
	// states is uploaded — there is nothing up there that could be kept instead.
	const editOptions = toMessageEditOptions(initial, [], store.read());
	const response = await interaction.editReply(
		// `IS_COMPONENTS_V2` is set on the *first* send only, never again: Discord
		// treats it as irreversible on a message — an edit can never clear it —
		// so posing it here and only here is what keeps a later re-render from
		// trying to flip a flag Discord would refuse to change.
		initial.layout === "card"
			? { ...editOptions, flags: MessageFlags.IsComponentsV2 }
			: editOptions,
	);

	const handle = mountInteractiveMessageCollector({
		interaction,
		response,
		buttons: options.buttons,
		selects: options.selects,
		view: options.view,
		store,
		ownerId: options.ownerId,
		...(options.onEnd === undefined ? {} : { onEnd: options.onEnd }),
		idleMs: options.idleMs ?? COLLECTOR_IDLE_MS,
		logger: options.logger,
	});

	return { ...handle, store };
}
