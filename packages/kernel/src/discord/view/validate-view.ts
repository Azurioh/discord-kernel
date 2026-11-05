import type { Attachment } from "discord.js";
import type { MediaItem, V2Component, View, ViewRow } from "@/discord/view/view";
import { EmptyViewError, MissingAttachmentError, ViewLimitError } from "@/discord/view/view-errors";
import {
	MAX_GALLERY_ITEMS,
	MAX_MEDIA_DESCRIPTION,
	MAX_MESSAGE_EMBEDS,
	MAX_MESSAGE_ROWS,
	MAX_ROW_BUTTONS,
	MAX_V2_COMPONENTS,
	MAX_V2_TEXT_CHARACTERS,
} from "@/discord/view/view-limits";

/** What a V2 view adds up to across its nodes, nested ones included. */
interface V2Totals {
	components: number;
	characters: number;
	fileNames: string[];
}

function assertAtMost(limit: string, actual: number, max: number): void {
	if (actual > max) {
		throw new ViewLimitError(limit, actual, max);
	}
}

/** A buttons row holds one to `MAX_ROW_BUTTONS` buttons; a select fills its row by construction. */
function assertRow<S>(row: ViewRow<S>): void {
	if (row.type === "select") {
		return;
	}
	if (row.buttons.length === 0) {
		throw new ViewLimitError("MAX_ROW_BUTTONS", 0, MAX_ROW_BUTTONS);
	}
	assertAtMost("MAX_ROW_BUTTONS", row.buttons.length, MAX_ROW_BUTTONS);
}

function assertMedia(item: MediaItem): void {
	assertAtMost("MAX_MEDIA_DESCRIPTION", item.description?.length ?? 0, MAX_MEDIA_DESCRIPTION);
}

/** Check one node's own rules and add what it spends to `totals`. */
function addNode<S>(node: V2Component<S>, totals: V2Totals): void {
	switch (node.type) {
		case "text":
			totals.components += 1;
			totals.characters += node.content.length;
			return;
		case "container": {
			const children = node.children.filter((child) => child !== null);
			if (children.length === 0) {
				throw new EmptyViewError("v2");
			}
			totals.components += 1;
			for (const child of children) {
				addNode(child, totals);
			}
			return;
		}
		case "section":
			if (node.accessory.thumbnail !== undefined) {
				assertMedia(node.accessory.thumbnail);
			}
			// The section, each text display, and the accessory.
			totals.components += 1 + node.texts.length + 1;
			totals.characters += node.texts.reduce((sum, text) => sum + text.length, 0);
			return;
		case "separator":
			totals.components += 1;
			return;
		case "gallery":
			if (node.items.length === 0) {
				throw new ViewLimitError("MAX_GALLERY_ITEMS", 0, MAX_GALLERY_ITEMS);
			}
			assertAtMost("MAX_GALLERY_ITEMS", node.items.length, MAX_GALLERY_ITEMS);
			for (const item of node.items) {
				assertMedia(item);
			}
			// Items are data on the gallery, not components of their own.
			totals.components += 1;
			return;
		case "file":
			totals.components += 1;
			totals.fileNames.push(node.name);
			return;
		case "buttons":
			assertRow(node);
			totals.components += 1 + node.buttons.length;
			return;
		case "select":
			// The row and the menu.
			totals.components += 2;
			return;
		default:
			node satisfies never;
	}
}

/** The attachment names a `file` node may reference once the message is sent. */
function availableNames<S>(view: View<S>, attachments: readonly Attachment[]): readonly string[] {
	if (view.files !== undefined) {
		return view.files.map((file) => file.name);
	}
	return attachments.map((attachment) => attachment.name);
}

function validateV2<S>(
	view: View<S>,
	components: readonly V2Component<S>[],
	attachments: readonly Attachment[],
): void {
	if (components.length === 0) {
		throw new EmptyViewError("v2");
	}
	const totals: V2Totals = { components: 0, characters: 0, fileNames: [] };
	for (const component of components) {
		addNode(component, totals);
	}
	assertAtMost("MAX_V2_COMPONENTS", totals.components, MAX_V2_COMPONENTS);
	assertAtMost("MAX_V2_TEXT_CHARACTERS", totals.characters, MAX_V2_TEXT_CHARACTERS);

	const names = availableNames(view, attachments);
	const missing = totals.fileNames.find((name) => !names.includes(name));
	if (missing !== undefined) {
		throw new MissingAttachmentError(missing);
	}
}

function validateV1<S>(
	content: string | undefined,
	embedCount: number,
	rows: readonly ViewRow<S>[],
): void {
	if ((content === undefined || content.length === 0) && embedCount === 0 && rows.length === 0) {
		throw new EmptyViewError("v1");
	}
	assertAtMost("MAX_MESSAGE_EMBEDS", embedCount, MAX_MESSAGE_EMBEDS);
	assertAtMost("MAX_MESSAGE_ROWS", rows.length, MAX_MESSAGE_ROWS);
	for (const row of rows) {
		assertRow(row);
	}
}

/**
 * Refuse a view Discord would refuse, naming the limit it breaks, before any
 * builder runs.
 *
 * @param view - The view about to be rendered.
 * @param attachments - The message's current attachments, which a `file` node
 *   may reference when the view leaves `files` out.
 * @throws {EmptyViewError} The view, or one of its containers, holds nothing.
 * @throws {ViewLimitError} A count or length goes over a `view-limits` constant.
 * @throws {MissingAttachmentError} A `file` node names an attachment the message will not carry.
 */
export function validateView<S>(view: View<S>, attachments: readonly Attachment[]): void {
	if (view.components !== undefined) {
		validateV2(
			view,
			view.components.filter((component) => component !== null),
			attachments,
		);
		return;
	}
	validateV1(
		view.content,
		view.embeds?.length ?? 0,
		(view.rows ?? []).filter((row) => row !== null),
	);
}
