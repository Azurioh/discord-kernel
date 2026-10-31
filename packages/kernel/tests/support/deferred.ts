/** A promise whose settlement is controlled by the test. */
export interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly resolve: (value: T | PromiseLike<T>) => void;
	readonly reject: (reason?: unknown) => void;
}

/**
 * Create a controlled promise without relying on newer Promise runtime helpers.
 * @returns A promise with its settlement operations.
 * @throws Never.
 */
export function createDeferred<T>(): Deferred<T> {
	let resolve!: Deferred<T>["resolve"];
	let reject!: Deferred<T>["reject"];
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}
