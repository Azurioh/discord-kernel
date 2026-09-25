import { vi } from "vitest";
import type { Logger } from "@/logger";

/** A {@link Logger} double: every level is a spy, and `child` hands back the same double. */
export function createFakeLogger(): Logger {
	const logger: Logger = {
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
		child: () => logger,
	};
	return logger;
}
