import type { ModuleAvailability } from "@/discord/module-availability";
import type { BotModule } from "@/module/module";

type ModuleState = "pending" | "ready" | "unavailable";

/** Runtime module ownership and readiness, shared by lifecycle and all routers. */
export class ModuleStatus implements ModuleAvailability {
	private readonly statuses = new Map<string, ModuleState>();
	constructor(modules: readonly BotModule[]) {
		for (const module of modules) {
			this.statuses.set(module.name, "pending");
		}
	}
	/** Whether setup completed successfully, including modules without setup. */
	isAvailable(moduleName: string): boolean {
		return this.statuses.get(moduleName) === "ready";
	}
	/** Record successful setup before jobs and routing become reachable. */
	markReady(moduleName: string): void {
		this.statuses.set(moduleName, "ready");
	}
	/** Disable an optional module for the lifetime of the bot. */
	markUnavailable(moduleName: string): void {
		this.statuses.set(moduleName, "unavailable");
	}
}
