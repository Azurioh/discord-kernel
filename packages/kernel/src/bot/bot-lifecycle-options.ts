import type { ProcessLike } from "@/bot/process-like";

/** Process handling and bounded shutdown configuration shared by bot assembly and lifecycle. */
export interface BotLifecycleOptions {
	readonly shutdownTimeoutMs?: number;
	readonly handleSignals?: boolean;
	readonly handleCrashes?: boolean;
	readonly flushes?: readonly {
		readonly name: string;
		flush(): Promise<void> | void;
	}[];
	readonly process?: ProcessLike;
}
