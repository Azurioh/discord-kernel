/** Process events the bot lifecycle owns. */
export type ProcessEvent = "SIGINT" | "SIGTERM" | "uncaughtException" | "unhandledRejection";

/**
 * Removable process listeners and an injectable exit boundary.
 *
 * @port
 */
export interface ProcessLike {
	on(event: ProcessEvent, listener: (...args: unknown[]) => void): unknown;
	off(event: ProcessEvent, listener: (...args: unknown[]) => void): unknown;
	exitCode?: number | string | undefined;
	exit(code?: number): void;
}
