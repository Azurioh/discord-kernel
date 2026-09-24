import { describe, expect, it } from "vitest";
import { createKeyedQueue } from "@/concurrency/keyed-queue";

/** A promise plus the handles to settle it, so a test drives ordering explicitly. */
function createDeferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** Let every already-scheduled microtask (the queue's own chaining) drain. */
function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

describe("createKeyedQueue", () => {
	it("runs tasks on the same key in submission order", async () => {
		const queue = createKeyedQueue();
		const order: string[] = [];
		const first = createDeferred<void>();

		const slow = queue.run("guild", async () => {
			await first.promise;
			order.push("first");
		});
		const fast = queue.run("guild", async () => {
			order.push("second");
		});

		await flushMicrotasks();
		expect(order).toEqual([]);

		first.resolve();
		await Promise.all([slow, fast]);
		expect(order).toEqual(["first", "second"]);
	});

	it("runs tasks on distinct keys in parallel", async () => {
		const queue = createKeyedQueue();
		const blocked = createDeferred<void>();
		const order: string[] = [];

		const held = queue.run("guild-a", async () => {
			await blocked.promise;
			order.push("a");
		});
		const free = queue.run("guild-b", async () => {
			order.push("b");
		});

		// `b` completes while `a` is still blocked: the keys do not share a chain.
		await free;
		expect(order).toEqual(["b"]);

		blocked.resolve();
		await held;
		expect(order).toEqual(["b", "a"]);
	});

	it("propagates a rejection to its own caller", async () => {
		const queue = createKeyedQueue();
		const failure = new Error("boom");

		await expect(queue.run("guild", () => Promise.reject(failure))).rejects.toBe(failure);
	});

	it("keeps running later tasks after a task rejected", async () => {
		const queue = createKeyedQueue();
		const order: string[] = [];

		const failing = queue.run("guild", async () => {
			order.push("failing");
			throw new Error("boom");
		});
		const following = queue.run("guild", async () => {
			order.push("following");
			return "done";
		});

		await expect(failing).rejects.toThrow("boom");
		await expect(following).resolves.toBe("done");
		expect(order).toEqual(["failing", "following"]);
	});

	it("forgets a key once its chain is idle", async () => {
		const queue = createKeyedQueue();

		await queue.run("guild", async () => undefined);
		await expect(queue.run("guild", () => Promise.reject(new Error("boom")))).rejects.toThrow(
			"boom",
		);
		await flushMicrotasks();

		expect(queue.size).toBe(0);
	});

	it("keeps the key while work is still queued", async () => {
		const queue = createKeyedQueue();
		const pending = createDeferred<void>();

		const running = queue.run("guild", () => pending.promise);
		await flushMicrotasks();
		expect(queue.size).toBe(1);

		pending.resolve();
		await running;
		await flushMicrotasks();
		expect(queue.size).toBe(0);
	});

	it("returns each task's own resolved value", async () => {
		const queue = createKeyedQueue();

		const values = await Promise.all([
			queue.run("guild", async () => 1),
			queue.run("guild", async () => 2),
		]);

		expect(values).toEqual([1, 2]);
	});
});
