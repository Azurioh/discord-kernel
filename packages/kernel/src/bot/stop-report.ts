/** Why the bot began its single shutdown run. */
export type StopReason = "manual" | "signal" | "crash" | "startFailure";

/** The complete result of graceful shutdown, including failed and abandoned steps. */
export interface StopReport {
	readonly ok: boolean;
	readonly reason: StopReason;
	readonly signal?: string;
	readonly failed: readonly {
		readonly step: string;
		readonly target?: string;
		readonly error: string;
	}[];
	readonly abandoned: readonly { readonly step: string; readonly target?: string }[];
}
