/** The process-wide readiness of an owning module, independent of guild settings. @port */
export interface ModuleAvailability {
	/** Whether this module may receive work. @param moduleName - Owning module. @returns Its availability. */
	isAvailable(moduleName: string): boolean;
}
