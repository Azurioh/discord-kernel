import type { DatabaseConnection } from "@/persistence/database";

/** A {@link DatabaseConnection} that opens nothing, and tells a test how it was used. */
export interface InMemoryDatabase extends DatabaseConnection {
	readonly connected: boolean;
	readonly connectCount: number;
	readonly closeCount: number;
	/** Make the next `connect` reject with `error`; the one after succeeds again. */
	failOnConnect(error: Error): void;
}

/**
 * The in-memory twin of {@link DatabaseConnection}.
 *
 * @param driver - the driver name it reports; `"in-memory"` by default.
 */
export function createInMemoryDatabase(driver = "in-memory"): InMemoryDatabase {
	let connected = false;
	let connectCount = 0;
	let closeCount = 0;
	let nextFailure: Error | null = null;

	return {
		driver,
		get connected() {
			return connected;
		},
		get connectCount() {
			return connectCount;
		},
		get closeCount() {
			return closeCount;
		},
		failOnConnect(error) {
			nextFailure = error;
		},
		async connect() {
			connectCount += 1;
			const failure = nextFailure;
			if (failure !== null) {
				nextFailure = null;
				throw failure;
			}
			connected = true;
		},
		async close() {
			closeCount += 1;
			connected = false;
		},
	};
}
