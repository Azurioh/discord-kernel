/**
 * Two providers registered the same token. Raised while modules register their
 * placeholders at boot — a wiring mistake that must stop the boot, never a
 * runtime condition a guild's rendered text could trigger.
 */
export class DuplicatePlaceholderTokenError extends Error {
	constructor(readonly token: string) {
		super(`Placeholder token "${token}" is registered twice`);
		this.name = "DuplicatePlaceholderTokenError";
	}
}
