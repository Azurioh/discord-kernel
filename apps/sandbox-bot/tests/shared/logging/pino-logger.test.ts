import { describe, expect, it, vi } from "vitest";
import { createPinoLogger } from "@/shared/logging/pino-logger";

/** A destination that keeps each written line, parsed. */
function createMemoryDestination() {
	const records: Record<string, unknown>[] = [];
	return {
		records,
		write: (line: string) => {
			records.push(JSON.parse(line));
		},
	};
}

describe("createPinoLogger", () => {
	it("writes the record's fields, the message and the name on one JSON line", () => {
		const destination = createMemoryDestination();

		createPinoLogger("sandbox-bot", destination).info({ guildId: "1" }, "Joined a guild");

		expect(destination.records).toEqual([
			expect.objectContaining({ name: "sandbox-bot", guildId: "1", msg: "Joined a guild" }),
		]);
	});

	it("stamps a child logger's bindings on every record", () => {
		const destination = createMemoryDestination();

		createPinoLogger("sandbox-bot", destination).child({ module: "demo" }).warn("Careful");

		expect(destination.records).toEqual([
			expect.objectContaining({ module: "demo", msg: "Careful" }),
		]);
	});

	it("serialises an error passed as err, stack included", () => {
		const destination = createMemoryDestination();

		createPinoLogger("sandbox-bot", destination).error({ err: new Error("boom") }, "Failed");

		expect(destination.records[0]?.err).toEqual(
			expect.objectContaining({ message: "boom", stack: expect.any(String) }),
		);
	});
	it("waits for the destination flush callback", async () => {
		let finish: (() => void) | undefined;
		const destination = {
			write: vi.fn(),
			flush: vi.fn((callback: () => void) => {
				finish = callback;
			}),
		};
		const logger = createPinoLogger("test", destination);
		const settled = vi.fn();
		const flushing = logger.flush().then(settled);
		await Promise.resolve();
		expect(settled).not.toHaveBeenCalled();
		expect(destination.flush).toHaveBeenCalledOnce();
		finish?.();
		await flushing;
		expect(settled).toHaveBeenCalledOnce();
	});

	it("propagates a destination flush failure", async () => {
		const error = new TypeError("flush failed");
		const destination = {
			write: vi.fn(),
			flush: (callback: (error: Error) => void) => callback(error),
		};
		await expect(createPinoLogger("test", destination).flush()).rejects.toBe(error);
	});
});
