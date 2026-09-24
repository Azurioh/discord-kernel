/**
 * Serialises asynchronous work per key while leaving distinct keys concurrent.
 */
export interface KeyedQueue {
	/** Run `task` after every task already queued for `key` has settled. */
	run<T>(key: string, task: () => Promise<T>): Promise<T>;
	/** Number of keys with work in flight — exposed so tests can assert no leak. */
	readonly size: number;
}

/**
 * Gateway handlers fire concurrently for the same entity (two rapid events on one
 * channel, a member joining twice, an event replay after a resume), so
 * read-modify-write logic keyed on that entity interleaves and corrupts state.
 * Chaining per key restores ordering without a global lock, which would
 * needlessly serialise unrelated guilds.
 */
export function createKeyedQueue(): KeyedQueue {
	const chains = new Map<string, Promise<unknown>>();

	return {
		get size() {
			return chains.size;
		},
		run<T>(key: string, task: () => Promise<T>): Promise<T> {
			const previous = chains.get(key) ?? Promise.resolve();
			// The chain continues on the *settled* tail: a rejected task must not
			// poison the queue for the tasks behind it, while `result` keeps the
			// rejection observable by this caller alone.
			const settledTail = previous.then(
				() => undefined,
				() => undefined,
			);
			const result = settledTail.then(task);
			const tail = result.then(
				() => undefined,
				() => undefined,
			);
			chains.set(key, tail);
			// Only the task that is still the tail may drop the entry, otherwise a
			// later enqueue would be forgotten and the Map would grow unbounded.
			void tail.then(() => {
				if (chains.get(key) === tail) {
					chains.delete(key);
				}
			});
			return result;
		},
	};
}
