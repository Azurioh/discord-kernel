import { vi } from "vitest";
import { createInMemoryLogger, type InMemoryLogger } from "@/in-memory-logger";

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

/**
 * A {@link Logger} double over the in-memory twin: every level is a spy that
 * still records its entry, and `child` hands back the same double, so a
 * suite sees a child's calls on the parent's spies.
 */
export function createFakeLogger(): InMemoryLogger {
	const logger = createInMemoryLogger();
	for (const level of LEVELS) {
		vi.spyOn(logger, level);
	}
	logger.child = () => logger;
	return logger;
}
