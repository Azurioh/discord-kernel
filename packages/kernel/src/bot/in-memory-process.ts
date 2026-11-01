import type { ProcessEvent, ProcessLike } from "@/bot/process-like";

/** A process twin whose events and recorded exit calls are controlled in memory. */
export interface InMemoryProcess extends ProcessLike {
	emit(event: ProcessEvent, ...args: unknown[]): void;
	listenerCount(event: ProcessEvent): number;
	readonly exits: readonly (number | undefined)[];
}

class MemoryProcess implements InMemoryProcess {
	exitCode: number | string | undefined;
	readonly #listeners = new Map<ProcessEvent, Set<(...args: unknown[]) => void>>();
	readonly #exits: (number | undefined)[] = [];

	get exits(): readonly (number | undefined)[] {
		return [...this.#exits];
	}

	on(event: ProcessEvent, listener: (...args: unknown[]) => void): void {
		const listeners = this.#listeners.get(event) ?? new Set<(...args: unknown[]) => void>();
		listeners.add(listener);
		this.#listeners.set(event, listeners);
	}

	off(event: ProcessEvent, listener: (...args: unknown[]) => void): void {
		this.#listeners.get(event)?.delete(listener);
	}

	emit(event: ProcessEvent, ...args: unknown[]): void {
		const listeners = [...(this.#listeners.get(event) ?? [])];
		for (const listener of listeners) {
			listener(...args);
		}
	}

	listenerCount(event: ProcessEvent): number {
		return this.#listeners.get(event)?.size ?? 0;
	}

	exit(code?: number): void {
		this.#exits.push(code);
	}
}

/**
 * Create the in-memory ProcessLike twin, which never exits the real process.
 * @returns An independently controlled process.
 * @throws Never.
 */
export function createInMemoryProcess(): InMemoryProcess {
	return new MemoryProcess();
}
