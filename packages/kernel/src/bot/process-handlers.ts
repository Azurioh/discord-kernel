import type { ProcessEvent, ProcessLike } from "@/bot/process-like";
import type { StopReason, StopReport } from "@/bot/stop-report";
import { describeError } from "@/errors/describe-error";
import type { Logger } from "@/logger";

interface ProcessHandlersOptions {
	readonly process: ProcessLike;
	readonly logger: Logger;
	readonly handleSignals: boolean;
	readonly handleCrashes: boolean;
	readonly stop: (reason: StopReason, signal?: string) => Promise<StopReport>;
}

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;

class ProcessHandlers {
	readonly #options: ProcessHandlersOptions;
	readonly #listeners = new Map<ProcessEvent, (...args: unknown[]) => void>();
	#stopping = false;
	#crashed = false;

	constructor(options: ProcessHandlersOptions) {
		this.#options = options;
		if (options.handleSignals) {
			this.#listeners.set("SIGINT", this.#interrupt);
			this.#listeners.set("SIGTERM", this.#terminate);
		}
		if (options.handleCrashes) {
			this.#listeners.set("uncaughtException", this.#crash);
			this.#listeners.set("unhandledRejection", this.#crash);
		}
		for (const [event, listener] of this.#listeners) {
			options.process.on(event, listener);
		}
	}

	readonly remove = (): void => {
		for (const [event, listener] of this.#listeners) {
			this.#options.process.off(event, listener);
		}
		this.#listeners.clear();
	};

	readonly #interrupt = (): void => {
		void this.#stop("SIGINT");
	};

	readonly #terminate = (): void => {
		void this.#stop("SIGTERM");
	};

	readonly #crash = (error: unknown): void => {
		if (!this.#crashed) {
			this.#crashed = true;
			this.#options.logger.fatal({ err: describeError(error) }, "Process crashed");
		}
		void this.#stop();
	};

	async #stop(signal?: string): Promise<void> {
		if (this.#stopping) {
			return;
		}
		this.#stopping = true;
		let code = FAILURE_EXIT_CODE;
		try {
			const report =
				signal === undefined
					? await this.#options.stop("crash")
					: await this.#options.stop("signal", signal);
			if (report.ok && !this.#crashed) {
				code = SUCCESS_EXIT_CODE;
			}
		} catch (error) {
			this.#options.logger.error({ err: describeError(error) }, "Process shutdown failed");
		} finally {
			this.remove();
			this.#options.process.exitCode = code;
			this.#options.process.exit(code);
		}
	}
}

/**
 * Install the lifecycle's signal and crash listeners, sharing one stop and one exit.
 * @param params - Process, logger, enabled event groups and lifecycle stop operation.
 * @returns An idempotent remover that preserves listeners installed by other callers.
 * @throws Never, provided the process adapter accepts listener registration.
 */
export function installProcessHandlers(params: ProcessHandlersOptions): () => void {
	return new ProcessHandlers(params).remove;
}
