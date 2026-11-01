import { describe, expect, it, vi } from "vitest";
import { createInMemoryProcess } from "@/bot/in-memory-process";
import type { ProcessEvent } from "@/bot/process-like";

const EVENTS: readonly ProcessEvent[] = [
	"SIGINT",
	"SIGTERM",
	"uncaughtException",
	"unhandledRejection",
];

describe("createInMemoryProcess", () => {
	it("tracks listeners independently per event and emits their arguments", () => {
		const process = createInMemoryProcess();
		const listeners = new Map(EVENTS.map((event) => [event, vi.fn()]));
		for (const [event, listener] of listeners) {
			expect(process.listenerCount(event)).toBe(0);
			process.on(event, listener);
			expect(process.listenerCount(event)).toBe(1);
		}
		const error = new TypeError("failure");
		process.emit("unhandledRejection", error, "promise");
		for (const [event, listener] of listeners) {
			if (event === "unhandledRejection") {
				expect(listener).toHaveBeenCalledExactlyOnceWith(error, "promise");
			} else {
				expect(listener).not.toHaveBeenCalled();
			}
			process.off(event, listener);
			expect(process.listenerCount(event)).toBe(0);
		}
	});

	it("removes only the requested listener for the requested event", () => {
		const process = createInMemoryProcess();
		const shared = vi.fn();
		const remaining = vi.fn();
		process.on("SIGINT", shared);
		process.on("SIGTERM", shared);
		process.on("SIGINT", remaining);
		process.off("SIGINT", shared);
		process.off("uncaughtException", shared);
		process.emit("SIGINT");
		expect(shared).not.toHaveBeenCalled();
		expect(remaining).toHaveBeenCalledOnce();
		process.emit("SIGTERM");
		expect(shared).toHaveBeenCalledOnce();
		expect(process.listenerCount("SIGINT")).toBe(1);
		expect(process.listenerCount("SIGTERM")).toBe(1);
	});

	it("records explicit and omitted exit codes without exiting or changing exitCode", () => {
		const realExit = vi.spyOn(globalThis.process, "exit");
		const process = createInMemoryProcess();
		process.exitCode = 7;
		process.exit(0);
		process.exit(1);
		process.exit();
		expect(process.exits).toEqual([0, 1, undefined]);
		expect(process.exitCode).toBe(7);
		expect(realExit).not.toHaveBeenCalled();
		realExit.mockRestore();
	});

	it("keeps separate instances independent and returns exit history snapshots", () => {
		const first = createInMemoryProcess();
		const second = createInMemoryProcess();
		const listener = vi.fn();
		const beforeExit = first.exits;
		first.on("SIGINT", listener);
		first.exit(1);
		second.emit("SIGINT");
		expect(listener).not.toHaveBeenCalled();
		expect(second.listenerCount("SIGINT")).toBe(0);
		expect(second.exits).toEqual([]);
		expect(beforeExit).toEqual([]);
		expect(first.exits).toEqual([1]);
	});
});
