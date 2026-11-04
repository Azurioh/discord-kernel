/** A modal cannot acknowledge an interaction that was already answered or deferred. */
export class ModalPromptError extends Error {
	constructor() {
		super("Cannot prompt a modal on an answered or deferred interaction");
		this.name = "ModalPromptError";
	}
}
