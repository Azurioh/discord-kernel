import {
	type APIMessageTopLevelComponent,
	type Attachment,
	type EmbedBuilder,
	type JSONEncodable,
	MessageFlags,
	type MessageMentionOptions,
} from "discord.js";
import { type MessageUpload, planMessageAttachments } from "@/discord/ui/message-attachments";
import { compileV2Component } from "@/discord/view/compile-v2-component";
import { type CompileContext, compileViewRow } from "@/discord/view/compile-view-row";
import { validateView } from "@/discord/view/validate-view";
import type { View } from "@/discord/view/view";
import { ViewLayoutSwitchError } from "@/discord/view/view-errors";

/** How a view is rendered. `state` is required exactly when the view's controls read one. */
export type RenderOptions<S> = ([S] extends [never]
	? { readonly state?: never }
	: { readonly state: S }) & {
	/** Render every button and select disabled: the "ended" render. */
	readonly disabled?: boolean;
	/** Only a reply or a follow-up can be made ephemeral; the result then fits those alone. */
	readonly ephemeral?: boolean;
	/** The message's current attachments, for an edit and for `file` node checks. */
	readonly attachments?: readonly Attachment[];
	/** The layout of the message being updated; `"v2"` refuses a V1 view. */
	readonly previous?: "v1" | "v2";
};

/** A rendered view, assignable to the options of reply, editReply, followUp and update. */
export interface RenderedMessage {
	content?: string;
	embeds?: EmbedBuilder[];
	components: JSONEncodable<APIMessageTopLevelComponent>[];
	files?: MessageUpload[];
	attachments?: Attachment[];
	allowedMentions?: MessageMentionOptions;
	flags?: readonly MessageFlags.IsComponentsV2[];
}

/**
 * A view rendered with `ephemeral` possibly set: assignable to reply and
 * followUp options only, since discord.js refuses the `Ephemeral` flag on an
 * edit or an update.
 */
export interface RenderedReply extends Omit<RenderedMessage, "flags"> {
	flags?: readonly (MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)[];
}

/** The flags a layout and an ephemeral request add up to, left out when there are none. */
function flagsOf(v2: boolean, ephemeral: boolean): Pick<RenderedReply, "flags"> {
	const flags: (MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)[] = [];
	if (v2) {
		flags.push(MessageFlags.IsComponentsV2);
	}
	if (ephemeral) {
		flags.push(MessageFlags.Ephemeral);
	}
	return flags.length === 0 ? {} : { flags };
}

/**
 * Turn a view into the options discord.js sends: validate it, compile its nodes
 * and set its flags. The only place a message is flagged Components V2.
 *
 * A view stating `files` gets exactly those: a file already on the message
 * under the same name is kept, not uploaded again. A view leaving `files` out
 * states neither `files` nor `attachments`, leaving the message's own alone.
 *
 * @param view - What the message shows.
 * @param options - State, disabled, ephemeral, current attachments and previous layout.
 * @returns The options for any send kind; for reply and followUp only when `ephemeral` may be set.
 * @throws {ViewLayoutSwitchError} A V1 view would update a V2 message.
 * @throws {EmptyViewError | ViewLimitError | MissingAttachmentError} From `validateView`, before any builder runs.
 */
export function renderView<S = never>(
	view: View<S>,
	options: RenderOptions<S> & { readonly ephemeral?: false },
): RenderedMessage;
export function renderView<S = never>(view: View<S>, options: RenderOptions<S>): RenderedReply;
export function renderView<S = never>(view: View<S>, options: RenderOptions<S>): RenderedReply {
	const attachments = options.attachments ?? [];
	if (options.previous === "v2" && view.components === undefined) {
		throw new ViewLayoutSwitchError();
	}
	validateView(view, attachments);

	// Unread when `S` is `never`: a view without stateful controls has nothing to render against.
	const context: CompileContext<S> = {
		state: options.state as S,
		disabled: options.disabled ?? false,
	};
	const mentions =
		view.allowedMentions === undefined ? {} : { allowedMentions: view.allowedMentions };
	const files = view.files === undefined ? {} : planMessageAttachments(attachments, view.files);
	const ephemeral = options.ephemeral ?? false;

	if (view.components !== undefined) {
		return {
			components: view.components
				.filter((component) => component !== null)
				.map((component) => compileV2Component(component, context)),
			...mentions,
			...files,
			...flagsOf(true, ephemeral),
		};
	}
	return {
		...(view.content === undefined ? {} : { content: view.content }),
		embeds: [...(view.embeds ?? [])],
		components: (view.rows ?? [])
			.filter((row) => row !== null)
			.map((row) => compileViewRow(row, context)),
		...mentions,
		...files,
		...flagsOf(false, ephemeral),
	};
}
