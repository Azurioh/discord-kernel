/**
 * A view goes over a limit Discord enforces. Thrown before any builder runs, so
 * the author sees which limit, not a validation error from discord.js.
 */
export class ViewLimitError extends Error {
	constructor(
		/** The name of the constant in `@/discord/view/view-limits`, e.g. `"MAX_V2_COMPONENTS"`. */
		readonly limit: string,
		readonly actual: number,
		readonly max: number,
	) {
		super(`View exceeds ${limit}: ${actual} over a maximum of ${max}`);
		this.name = "ViewLimitError";
	}
}

/**
 * A `file` node names an attachment the message will not carry: absent from the
 * view's `files`, or, when `files` is left out, from the message's current
 * attachments.
 */
export class MissingAttachmentError extends Error {
	constructor(
		/** The name the `file` node references, as `attachment://<fileName>`. */
		readonly fileName: string,
	) {
		super(`View references attachment "${fileName}", which the message does not carry`);
		this.name = "MissingAttachmentError";
	}
}

/** A view holds nothing to send: no content, embed or row (V1), no component (V2), or an empty container. */
export class EmptyViewError extends Error {
	constructor(readonly layout: "v1" | "v2") {
		super(`View has nothing to send (${layout} layout)`);
		this.name = "EmptyViewError";
	}
}

/**
 * A message sent with Components V2 would be updated with a V1 view. Discord can
 * set the V2 flag but never clear it, so the edit would be refused.
 */
export class ViewLayoutSwitchError extends Error {
	constructor() {
		super("Cannot update a Components V2 message with a V1 view");
		this.name = "ViewLayoutSwitchError";
	}
}
