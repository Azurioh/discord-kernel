import { describe, expect, it } from "vitest";
import { runWithConcurrency } from "@/concurrency/run-with-concurrency";

/** Let every already-scheduled microtask drain, mirroring keyed-queue.test.ts. */
function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

describe("runWithConcurrency", () => {
	it("returns results in input order regardless of completion order", async () => {
		const delays = [30, 10, 20];
		const results = await runWithConcurrency(delays, 3, (delay, index) => {
			return new Promise<number>((resolve) => {
				setTimeout(() => resolve(index), delay);
			});
		});

		expect(results).toEqual([0, 1, 2]);
	});

	it("never runs more than `limit` workers concurrently", async () => {
		let active = 0;
		let maxActive = 0;
		const items = Array.from({ length: 10 }, (_, index) => index);

		await runWithConcurrency(items, 3, async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			await flushMicrotasks();
			active--;
		});

		expect(maxActive).toBeLessThanOrEqual(3);
	});

	it("runs every item exactly once", async () => {
		const items = Array.from({ length: 25 }, (_, index) => index);
		const seen: number[] = [];

		await runWithConcurrency(items, 4, async (item) => {
			seen.push(item);
		});

		expect(seen.slice().sort((a, b) => a - b)).toEqual(items);
	});

	it("resolves to an empty array for an empty input", async () => {
		const results = await runWithConcurrency<number, number>([], 5, async (item) => item);

		expect(results).toEqual([]);
	});

	it("clamps the limit to at least 1 and at most the item count", async () => {
		const items = [1, 2];

		await expect(runWithConcurrency(items, 0, async (item) => item)).resolves.toEqual([1, 2]);
		await expect(runWithConcurrency(items, 100, async (item) => item)).resolves.toEqual([1, 2]);
	});

	it("propagates a worker rejection", async () => {
		const items = [1, 2, 3];

		await expect(
			runWithConcurrency(items, 2, async (item) => {
				if (item === 2) {
					throw new Error("boom");
				}
				return item;
			}),
		).rejects.toThrow("boom");
	});
});
