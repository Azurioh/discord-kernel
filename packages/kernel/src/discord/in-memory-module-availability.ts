import type { ModuleAvailability } from "@/discord/module-availability";
/** Mutable in-memory availability for lifecycle orchestration and tests. */
export interface InMemoryModuleAvailability extends ModuleAvailability {
	/** Mark a module unavailable. @param moduleName - Owning module. @returns Nothing. */
	markUnavailable(moduleName: string): void;
}
/** Create an availability twin. @param unavailable - Initially unavailable module names, copied. @returns Independent module availability. */
export function createInMemoryModuleAvailability(
	unavailable: readonly string[] = [],
): InMemoryModuleAvailability {
	const names = new Set(unavailable);
	return {
		isAvailable(moduleName) {
			return !names.has(moduleName);
		},
		markUnavailable(moduleName) {
			names.add(moduleName);
		},
	};
}
