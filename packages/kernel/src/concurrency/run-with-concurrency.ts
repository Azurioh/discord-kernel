/**
 * Runs every task in `items` through `worker`, never letting more than `limit`
 * run at once, and resolves once all have settled. Results are returned in the
 * same order as `items`, regardless of completion order.
 *
 * Exists so callers that must fan out many independent async calls (e.g.
 * fetching a reaction's user list per distinct emoji across thousands of
 * messages) can bound how many are in flight without going fully sequential —
 * without pulling in an external dependency for what is, in essence, a small
 * counter and a queue (the same shape of problem `keyed-queue.ts` already
 * solves for *serialised* per-key work, just bounding *parallel* work here
 * instead).
 */
export async function runWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) {
		return [];
	}

	// `noUncheckedIndexedAccess` makes every `results[i]` a possible `undefined`
	// at the type level; asserting it away here is correct because every index
	// is written exactly once below, before this array is ever returned.
	const results = new Array<R>(items.length) as R[];
	let nextIndex = 0;

	async function runNext(): Promise<void> {
		const currentIndex = nextIndex;
		nextIndex += 1;
		if (currentIndex >= items.length) {
			return;
		}
		const item = items[currentIndex] as T;
		results[currentIndex] = await worker(item, currentIndex);
		await runNext();
	}

	const workerCount = Math.max(1, Math.min(limit, items.length));
	await Promise.all(Array.from({ length: workerCount }, runNext));

	return results;
}
