/** Two modules share a name and cannot be registered independently. */
export class DuplicateModuleError extends Error {
	constructor(
		readonly first: string,
		readonly second: string,
	) {
		super(`Modules "${first}" and "${second}" share a name`);
		this.name = "DuplicateModuleError";
	}
}

/** A module failed registration; the original failure is preserved as cause. */
export class ModuleRegistrationError extends Error {
	constructor(
		readonly moduleName: string,
		cause: unknown,
		readonly part?: string,
	) {
		super(`Module "${moduleName}" could not be registered`, { cause });
		this.name = "ModuleRegistrationError";
	}
}
