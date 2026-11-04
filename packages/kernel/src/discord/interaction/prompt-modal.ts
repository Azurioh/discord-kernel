import {
	type CommandInteraction,
	DiscordjsError,
	DiscordjsErrorCodes,
	type MessageComponentInteraction,
	type ModalBuilder,
	type ModalSubmitInteraction,
} from "discord.js";
import { ModalPromptError } from "@/discord/interaction/prompt-modal-errors";

/** The default collection window, including time spent writing the response: five minutes. */
export const MODAL_PROMPT_TIMEOUT_MS = 5 * 60 * 1000;
const COLLECTOR_TIMEOUT_SUFFIX = "reason: time";

/** A modal builder and reader whose value type is inferred by promptModal. */
export interface PromptableModal<V> {
	/** Build this opening with its unique state suffix. */
	build(state?: string): ModalBuilder;
	/** Read the submitted values. */
	read(submission: ModalSubmitInteraction): V;
}

/** A collected submission, or a modal dismissed when its collector expires. */
export type ModalPromptResult<V> =
	| {
			readonly status: "submitted";
			readonly interaction: ModalSubmitInteraction;
			readonly values: V;
	  }
	| { readonly status: "dismissed" };

// Collectors are local to this process. Distinguish even repeated openings of the same modal.
let modalOpenSequence = 0;

function nextModalOpenState(): string {
	modalOpenSequence += 1;
	return String(modalOpenSequence);
}

/**
 * Show a typed modal and collect only this member's submission for this opening.
 * @param interaction - An unanswered command or component interaction.
 * @param modal - The modal's builder and typed reader.
 * @param options - An optional collection deadline in milliseconds.
 * @returns Submitted values and their interaction, or dismissed on collector timeout.
 * @throws {ModalPromptError} If the interaction was already answered or deferred.
 * @throws Propagates build, show, read and non-timeout collection errors.
 */
export async function promptModal<V>(
	interaction: CommandInteraction | MessageComponentInteraction,
	modal: PromptableModal<V>,
	options?: { readonly timeoutMs?: number },
): Promise<ModalPromptResult<V>> {
	if (interaction.replied || interaction.deferred) {
		throw new ModalPromptError();
	}
	const built = modal.build(nextModalOpenState());
	const expectedCustomId = built.toJSON().custom_id;
	await interaction.showModal(built);
	let submission: ModalSubmitInteraction;
	try {
		submission = await interaction.awaitModalSubmit({
			time: options?.timeoutMs ?? MODAL_PROMPT_TIMEOUT_MS,
			filter: (candidate) =>
				candidate.user.id === interaction.user.id && candidate.customId === expectedCustomId,
		});
	} catch (error) {
		if (
			error instanceof DiscordjsError &&
			error.code === DiscordjsErrorCodes.InteractionCollectorError &&
			error.message.endsWith(COLLECTOR_TIMEOUT_SUFFIX)
		) {
			return { status: "dismissed" };
		}
		throw error;
	}
	return { status: "submitted", interaction: submission, values: modal.read(submission) };
}
