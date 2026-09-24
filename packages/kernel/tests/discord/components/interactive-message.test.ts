import { Collection, EmbedBuilder } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
	COLLECTOR_IDLE_MS,
	createStateStore,
	type InteractiveSelect,
	type InteractiveView,
	mountInteractiveMessageCollector,
	type SelectComponentContext,
} from "@/discord/components/interactive-message/interactive-message-collector";
import { type Button, createButton } from "@/discord/interaction/button";
import type { Logger } from "@/logger";

const OWNER_ID = "owner-1";
const OTHER_ID = "intruder-9";

interface Counter {
	value: number;
}

function createLoggerSpy(): Logger {
	const logger = {
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
		child: () => logger,
	};
	return logger as unknown as Logger;
}

function createView(): InteractiveView<Counter> {
	return {
		render: (state) => ({
			embeds: [new EmbedBuilder().setTitle(`Value ${state.value}`)],
			components: [],
		}),
		disabledControls: () => ({ components: [] }),
	};
}

/**
 * Minimal stand-in for a clicked button; the collector only reads these fields,
 * the type guards it sorts button from select menu with, and the message the
 * control sits on — which is what an update plans its attachments against.
 */
function createClick(customId: string, userId = OWNER_ID) {
	const update = vi.fn(async () => undefined);
	return {
		update,
		interaction: {
			customId,
			user: { id: userId },
			update,
			isButton: () => true,
			isAnySelectMenu: () => false,
			message: { attachments: new Collection() },
		} as unknown as Parameters<NonNullable<Button<Counter>["onClick"]>>[0]["interaction"],
	};
}

/** The same, for a menu: `values` is what the collector unwraps into the context. */
function createPick(customId: string, values: string[], userId = OWNER_ID) {
	const update = vi.fn(async () => undefined);
	return {
		update,
		interaction: {
			customId,
			user: { id: userId },
			values,
			update,
			isButton: () => false,
			isAnySelectMenu: () => true,
			message: { attachments: new Collection() },
		} as unknown as SelectComponentContext<Counter>["interaction"],
	};
}

/**
 * Harness around the collector: captures the options handed to discord.js and
 * the event handlers, so a test can fire a click or an expiry by hand.
 */
function mount(
	buttons: Button<Counter>[],
	initial: Counter = { value: 0 },
	selects: InteractiveSelect<Counter>[] = [],
	onEnd?: () => Promise<void> | void,
) {
	const handlers = new Map<string, (arg: unknown) => unknown>();
	const collectorOptions: { idle?: number; filter?: (clicked: unknown) => boolean } = {};

	const createMessageComponentCollector = vi.fn((options: Record<string, unknown>) => {
		Object.assign(collectorOptions, options);
		return {
			on(event: string, handler: (arg: unknown) => unknown) {
				handlers.set(event, handler);
			},
			off(event: string) {
				handlers.delete(event);
			},
			stop() {
				stopped.push("stop");
				// discord.js fires `end` on stop; whether a listener is still attached
				// is precisely what `handle.stop()` decides.
				handlers.get("end")?.(undefined);
			},
		};
	});

	const editReply = vi.fn(async () => undefined);
	const logger = createLoggerSpy();
	const store = createStateStore(initial);
	const view = createView();

	const stopped: string[] = [];
	const handle = mountInteractiveMessageCollector({
		interaction: { editReply } as unknown as Parameters<
			typeof mountInteractiveMessageCollector<Counter>
		>[0]["interaction"],
		response: { createMessageComponentCollector } as unknown as Parameters<
			typeof mountInteractiveMessageCollector<Counter>
		>[0]["response"],
		buttons,
		selects,
		view,
		store,
		ownerId: OWNER_ID,
		idleMs: COLLECTOR_IDLE_MS,
		...(onEnd === undefined ? {} : { onEnd }),
		logger,
	});

	return {
		collectorOptions,
		editReply,
		handle,
		stopped,
		logger,
		store,
		view,
		collect: (arg: unknown) => handlers.get("collect")?.(arg),
		end: () => handlers.get("end")?.(undefined),
	};
}

describe("mountInteractiveMessageCollector", () => {
	it("only accepts interactions from the owner", () => {
		const { collectorOptions } = mount([]);

		expect(collectorOptions.filter?.({ user: { id: OWNER_ID } })).toBe(true);
		expect(collectorOptions.filter?.({ user: { id: OTHER_ID } })).toBe(false);
	});

	it("bounds the lifetime with an idle delay, which discord.js rearms on every collect", () => {
		// The rearming itself belongs to discord.js: passing `idle` (rather than
		// `time`, which would be an absolute deadline) is what buys it.
		const { collectorOptions } = mount([]);

		expect(collectorOptions.idle).toBe(COLLECTOR_IDLE_MS);
		expect(collectorOptions).not.toHaveProperty("time");
	});

	it("routes a click to the button carrying that custom id", async () => {
		const onClick = vi.fn();
		const buttons = [
			createButton<Counter>({ id: "increment", onClick }),
			createButton<Counter>({ id: "reset", onClick: vi.fn() }),
		];
		const { collect } = mount(buttons);

		await collect(createClick("increment").interaction);

		expect(onClick).toHaveBeenCalledTimes(1);
		expect(onClick.mock.calls[0]?.[0].state).toEqual({ value: 0 });
	});

	it("ignores an unknown custom id without throwing", async () => {
		const onClick = vi.fn();
		const { collect, logger } = mount([createButton<Counter>({ id: "increment", onClick })]);

		await expect(
			collect(createClick("gone-in-a-previous-version").interaction),
		).resolves.toBeUndefined();

		expect(onClick).not.toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("advances the shared state and re-renders on update", async () => {
		const buttons = [
			createButton<Counter>({
				id: "increment",
				onClick: (ctx) => ctx.update({ value: ctx.state.value + 1 }),
			}),
		];
		const { collect, store } = mount(buttons);
		const click = createClick("increment");

		await collect(click.interaction);

		expect(store.read()).toEqual({ value: 1 });
		expect(click.update).toHaveBeenCalledTimes(1);
	});

	it("leaves the controls visibly inert once the collector ends", () => {
		const { end, editReply, view, store } = mount([]);

		end();

		expect(editReply).toHaveBeenCalledWith(view.disabledControls(store.read()));
	});

	it("stops without neutralising controls the caller already replaced", () => {
		// After a confirmed deletion the message — and its channel — are gone, so
		// the usual disabling edit would be aimed at nothing.
		const { handle, editReply, stopped } = mount([]);

		handle.stop();

		expect(stopped).toEqual(["stop"]);
		expect(editReply).not.toHaveBeenCalled();
	});

	// What a screen owes on closing — pushing its result to whatever it
	// configures — must not depend on how it closed.
	it("runs the closing work when the collector expires", async () => {
		const onEnd = vi.fn(async () => undefined);
		const { end } = mount([], { value: 0 }, [], onEnd);

		await end();

		expect(onEnd).toHaveBeenCalledTimes(1);
	});

	it("runs it on an explicit stop as well, controls or no controls", async () => {
		const onEnd = vi.fn(async () => undefined);
		const { handle, editReply } = mount([], { value: 0 }, [], onEnd);

		handle.stop();
		await vi.waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));

		expect(editReply).not.toHaveBeenCalled();
	});

	it("logs a failing closing work instead of letting it escape", async () => {
		const onEnd = vi.fn(async () => {
			throw new Error("the panel is gone");
		});
		const { end, logger } = mount([], { value: 0 }, [], onEnd);

		await expect(end()).resolves.toBeUndefined();

		expect(logger.warn).toHaveBeenCalledWith(
			{ err: expect.objectContaining({ message: "the panel is gone" }) },
			"Failed to close interactive message",
		);
	});

	it("routes a pick to the select menu carrying that custom id, values unwrapped", async () => {
		const onSelect = vi.fn();
		const { collect } = mount([], { value: 0 }, [{ id: "field", onSelect }]);

		await collect(createPick("field", ["title"]).interaction);

		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect.mock.calls[0]?.[0].values).toEqual(["title"]);
		expect(onSelect.mock.calls[0]?.[0].state).toEqual({ value: 0 });
	});

	it("advances the shared state and re-renders on a pick's update", async () => {
		const selects = [
			{
				id: "field",
				onSelect: (ctx: SelectComponentContext<Counter>) =>
					ctx.update({ value: ctx.state.value + 1 }),
			},
		];
		const { collect, store } = mount([], { value: 0 }, selects);
		const pick = createPick("field", ["title"]);

		await collect(pick.interaction);

		expect(store.read()).toEqual({ value: 1 });
		expect(pick.update).toHaveBeenCalledTimes(1);
	});

	it("never hands a pick to a button sharing its custom id", async () => {
		const onClick = vi.fn();
		const { collect } = mount([createButton<Counter>({ id: "shared", onClick })], { value: 0 }, []);

		await collect(createPick("shared", ["title"]).interaction);

		expect(onClick).not.toHaveBeenCalled();
	});

	/**
	 * At `error` and with the whole error: a throw here leaves the click
	 * unanswered, so it is a defect to be found. The regression this closes: only
	 * `error.message` was logged, and the one that actually happened in
	 * production was `CombinedPropertyError`, whose message is the constant
	 * "Received one or more errors" — everything naming the culprit sat in the
	 * errors nested under it.
	 */
	it("logs a failing handler whole, instead of letting it escape the collector", async () => {
		const buttons = [
			createButton<Counter>({
				id: "boom",
				onClick: () => {
					throw new Error("handler exploded");
				},
			}),
		];
		const { collect, logger } = mount(buttons);

		await expect(collect(createClick("boom").interaction)).resolves.toBeUndefined();

		expect(logger.error).toHaveBeenCalledWith(
			{
				err: expect.objectContaining({
					message: "handler exploded",
					stack: expect.stringContaining("handler exploded"),
				}),
				customId: "boom",
			},
			"Failed to update interactive message",
		);
	});

	it("keeps what an aggregate wraps, which is the only thing naming the culprit", async () => {
		const nested = new Error("Invalid string length: expected.length <= 100");
		const aggregate = new Error("Received one or more errors");
		(aggregate as unknown as { errors: unknown[] }).errors = [["description", nested]];
		const buttons = [
			createButton<Counter>({
				id: "boom",
				onClick: () => {
					throw aggregate;
				},
			}),
		];
		const { collect, logger } = mount(buttons);

		await collect(createClick("boom").interaction);

		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				err: expect.objectContaining({
					message: "Received one or more errors",
					causes: [
						expect.objectContaining({ message: "Invalid string length: expected.length <= 100" }),
					],
				}),
			}),
			"Failed to update interactive message",
		);
	});
});
