import type { Attachment } from "discord.js";

/**
 * A file a message carries: the bytes, and the name an embed resolves an
 * `attachment://` reference on.
 *
 * `Uint8Array` rather than `Buffer` so a caller can produce one without
 * reaching for a Node-specific type; the conversion happens here, at the edge
 * that hands it to discord.js.
 */
export interface MessageFile {
	readonly name: string;
	readonly bytes: Uint8Array;
}

/** A file as discord.js takes it on a send or an edit. */
export interface MessageUpload {
	readonly attachment: Buffer;
	readonly name: string;
}

/** What an edit has to state for a message to end up carrying exactly what was asked. */
export interface PlannedAttachments {
	readonly attachments: Attachment[];
	readonly files: MessageUpload[];
}

export function toMessageUpload(file: MessageFile): MessageUpload {
	return { attachment: Buffer.from(file.bytes), name: file.name };
}

/**
 * Split what a message should carry into what is already up there and what has
 * to be uploaded.
 *
 * Discord reads an edit's `attachments` field as the complete set the message
 * keeps — so `attachments: []` strips whatever it was published with, and
 * re-sending the bytes to hold on to a file would upload the same one again on
 * every unrelated re-render. Existing attachments are matched by name because
 * that is what an embed resolves `attachment://` on, so a file already up there
 * under the wanted name is the very one to keep.
 *
 * A caller carrying no files of its own never reaches this: it states neither
 * field, and Discord leaves the message's own alone.
 */
export function planMessageAttachments(
	existing: readonly Attachment[],
	wanted: readonly MessageFile[],
): PlannedAttachments {
	const kept = existing.filter((attachment) =>
		wanted.some((file) => file.name === attachment.name),
	);
	const uploaded = wanted.filter(
		(file) => !kept.some((attachment) => attachment.name === file.name),
	);
	return { attachments: kept, files: uploaded.map(toMessageUpload) };
}
