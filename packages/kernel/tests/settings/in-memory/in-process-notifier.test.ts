import { describe, expect, it, vi } from "vitest";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import type { SettingsChangedEvent } from "@/settings/ports/settings-changed-notifier";
import { createFakeLogger } from "../../support/fake-logger";

const event: SettingsChangedEvent = {
	guildId: "100000000000000001",
	moduleId: "tickets",
	changedKeys: ["maxOpen"],
	revision: 2,
	changedBy: "200000000000000001",
};

describe("createInProcessNotifier", () => {
	it("delivers a notified event to every subscriber", () => {
		const notifier = createInProcessNotifier(createFakeLogger());
		const first = vi.fn();
		const second = vi.fn();
		notifier.subscribe(first);
		notifier.subscribe(second);

		notifier.notify(event);

		expect(first).toHaveBeenCalledExactlyOnceWith(event);
		expect(second).toHaveBeenCalledExactlyOnceWith(event);
	});

	it("does nothing when nobody subscribed", () => {
		const notifier = createInProcessNotifier(createFakeLogger());

		expect(() => notifier.notify(event)).not.toThrow();
	});

	it("stops delivering to a listener once it unsubscribed", () => {
		const notifier = createInProcessNotifier(createFakeLogger());
		const kept = vi.fn();
		const removed = vi.fn();
		notifier.subscribe(kept);
		const unsubscribe = notifier.subscribe(removed);

		unsubscribe();
		notifier.notify(event);

		expect(removed).not.toHaveBeenCalled();
		expect(kept).toHaveBeenCalledOnce();
	});

	it("keeps delivering to the other listeners when one throws, and logs the failure", () => {
		const logger = createFakeLogger();
		const notifier = createInProcessNotifier(logger);
		const after = vi.fn();
		notifier.subscribe(() => {
			throw new Error("boom");
		});
		notifier.subscribe(after);

		expect(() => notifier.notify(event)).not.toThrow();

		expect(after).toHaveBeenCalledExactlyOnceWith(event);
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				guildId: event.guildId,
				moduleId: event.moduleId,
				err: expect.objectContaining({ message: "boom" }),
			}),
			"Settings change listener failed",
		);
	});

	it("requires a logger, so a listener failure is never silently dropped", () => {
		// @ts-expect-error the logger is mandatory
		expect(() => createInProcessNotifier()).not.toThrow();
	});
});
