import { Collection, EmbedBuilder } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { ComponentRuntime, RoutableInteraction } from "@/discord/components/component-router";
import type { InteractiveMessagePayload } from "@/discord/components/interactive-message";
import {
	createPersistentPaginator,
	decodePaginatorPage,
	encodePaginatorPage,
	type PersistentPage,
} from "@/discord/components/persistent-paginator";
import type { Logger } from "@/logger";

/**
 * A persistent paginator always renders the "embeds" layout — it has no `Card`
 * of its own to switch to — so every assertion below narrows once here rather
 * than guarding the discriminant at each call site.
 */
function asEmbeds<S>(
	payload: InteractiveMessagePayload<S>,
): Extract<InteractiveMessagePayload<S>, { layout?: "embeds" }> {
	if (payload.layout === "card") {
		throw new Error("expected the persistent paginator to render its embeds layout");
	}
	return payload;
}

const CUSTOM_ID = "reminders";
const PAGE_COUNT = 3;

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

function createRuntime(logger: Logger = createLoggerSpy()): ComponentRuntime {
	return {
		logger,
		presenter: {} as ComponentRuntime["presenter"],
		translator: {} as ComponentRuntime["translator"],
	};
}

function createFetcher(pageCount = PAGE_COUNT): (page: number) => Promise<PersistentPage> {
	return vi.fn(async (page: number) => ({
		embed: new EmbedBuilder().setTitle(`Page ${page}`),
		pageCount,
	}));
}

/** Minimal stand-in for a clicked button; the paginator only reads these fields. */
function createButtonClick(clickedId: string): {
	interaction: RoutableInteraction;
	deferUpdate: ReturnType<typeof vi.fn>;
	editReply: ReturnType<typeof vi.fn>;
} {
	const deferUpdate = vi.fn().mockResolvedValue(undefined);
	const editReply = vi.fn().mockResolvedValue(undefined);
	const interaction = {
		customId: clickedId,
		isButton: () => true,
		deferUpdate,
		editReply,
		// A clicked button always carries the message it sits on, which is what
		// the edit reads to work out which attachments to keep.
		message: { attachments: new Collection() },
	} as unknown as RoutableInteraction;
	return { interaction, deferUpdate, editReply };
}

function buttonIds(components: { toJSON(): unknown }[]): string[] {
	return components.flatMap((row) => {
		const json = row.toJSON() as { components: { custom_id: string }[] };
		return json.components.map((entry) => entry.custom_id);
	});
}

function disabledFlags(components: { toJSON(): unknown }[]): (boolean | undefined)[] {
	return components.flatMap((row) => {
		const json = row.toJSON() as { components: { disabled?: boolean }[] };
		return json.components.map((entry) => entry.disabled);
	});
}

describe("customId encoding", () => {
	it("round-trips a page through encode/decode", () => {
		const encoded = encodePaginatorPage(CUSTOM_ID, 4);
		expect(encoded).toBe("reminders:page:4");
		expect(decodePaginatorPage(CUSTOM_ID, encoded)).toBe(4);
	});

	it("stays under the handler prefix the router matches on", () => {
		expect(encodePaginatorPage(CUSTOM_ID, 1).startsWith(`${CUSTOM_ID}:`)).toBe(true);
	});

	it("rejects a customId belonging to another handler", () => {
		expect(decodePaginatorPage(CUSTOM_ID, "other:page:2")).toBeNull();
	});

	it("rejects malformed page segments", () => {
		expect(decodePaginatorPage(CUSTOM_ID, "reminders:page:")).toBeNull();
		expect(decodePaginatorPage(CUSTOM_ID, "reminders:page:abc")).toBeNull();
		expect(decodePaginatorPage(CUSTOM_ID, "reminders:page:-2")).toBeNull();
		expect(decodePaginatorPage(CUSTOM_ID, "reminders:page:1e3")).toBeNull();
		expect(decodePaginatorPage(CUSTOM_ID, CUSTOM_ID)).toBeNull();
	});
});

describe("createPersistentPaginator rendering", () => {
	it("renders the first page with navigation targets around it", async () => {
		const paginator = createPersistentPaginator({
			customId: CUSTOM_ID,
			fetchPage: createFetcher(),
		});

		const payload = asEmbeds(await paginator.render());

		expect(buttonIds(payload.components)).toEqual(["reminders:page:1", "reminders:page:2"]);
		expect(disabledFlags(payload.components)).toEqual([true, false]);
	});

	it("drops the action row when there is a single page", async () => {
		const paginator = createPersistentPaginator({
			customId: CUSTOM_ID,
			fetchPage: createFetcher(1),
		});

		const payload = asEmbeds(await paginator.render());

		expect(payload.components).toEqual([]);
		expect(payload.embeds).toHaveLength(1);
	});

	it("exposes a handler registered under the plain customId", () => {
		const paginator = createPersistentPaginator({
			customId: CUSTOM_ID,
			fetchPage: createFetcher(),
		});

		expect(paginator.handler.customId).toBe(CUSTOM_ID);
	});
});

describe("createPersistentPaginator clamping", () => {
	it("disables the next button on the last page", async () => {
		const paginator = createPersistentPaginator({
			customId: CUSTOM_ID,
			fetchPage: createFetcher(),
		});

		const payload = asEmbeds(await paginator.render(PAGE_COUNT));

		expect(disabledFlags(payload.components)).toEqual([false, true]);
		expect(buttonIds(payload.components)).toEqual(["reminders:page:2", "reminders:page:3"]);
	});

	it("clamps a page beyond the last one back into range", async () => {
		const fetchPage = createFetcher();
		const paginator = createPersistentPaginator({ customId: CUSTOM_ID, fetchPage });

		const payload = asEmbeds(await paginator.render(99));

		expect(fetchPage).toHaveBeenLastCalledWith(PAGE_COUNT);
		expect(buttonIds(payload.components)).toEqual(["reminders:page:2", "reminders:page:3"]);
	});

	it("clamps a page below the first one", async () => {
		const fetchPage = createFetcher();
		const paginator = createPersistentPaginator({ customId: CUSTOM_ID, fetchPage });

		await paginator.render(-3);

		expect(fetchPage).toHaveBeenLastCalledWith(1);
	});
});

describe("createPersistentPaginator click handling", () => {
	it("updates the message with the page carried by the customId", async () => {
		const fetchPage = createFetcher();
		const paginator = createPersistentPaginator({ customId: CUSTOM_ID, fetchPage });
		const { interaction, editReply } = createButtonClick(encodePaginatorPage(CUSTOM_ID, 2));

		await paginator.handler.handle(interaction, createRuntime());

		expect(fetchPage).toHaveBeenLastCalledWith(2);
		expect(editReply).toHaveBeenCalledWith(
			expect.objectContaining({
				components: expect.anything(),
			}),
		);
		const payload = editReply.mock.lastCall?.[0] as { components: { toJSON(): unknown }[] };
		expect(buttonIds(payload.components)).toEqual(["reminders:page:1", "reminders:page:3"]);
	});

	// The 3s interaction window is shorter than an arbitrary `fetchPage`, so the
	// acknowledgement has to land before the source is read, never after.
	it("acknowledges the click before reading the page source", async () => {
		const order: string[] = [];
		const fetchPage = vi.fn(async (page: number) => {
			order.push("fetchPage");
			return { embed: new EmbedBuilder().setTitle(`Page ${page}`), pageCount: PAGE_COUNT };
		});
		const paginator = createPersistentPaginator({ customId: CUSTOM_ID, fetchPage });
		const { interaction, deferUpdate, editReply } = createButtonClick(
			encodePaginatorPage(CUSTOM_ID, 2),
		);
		deferUpdate.mockImplementation(async () => {
			order.push("deferUpdate");
		});
		editReply.mockImplementation(async () => {
			order.push("editReply");
		});

		await paginator.handler.handle(interaction, createRuntime());

		expect(order[0]).toBe("deferUpdate");
		expect(order.at(-1)).toBe("editReply");
	});

	it("falls back to the first page on a stale customId instead of throwing", async () => {
		const logger = createLoggerSpy();
		const fetchPage = createFetcher();
		const paginator = createPersistentPaginator({ customId: CUSTOM_ID, fetchPage });
		const { interaction, editReply } = createButtonClick("reminders:legacy-shape");

		await expect(
			paginator.handler.handle(interaction, createRuntime(logger)),
		).resolves.toBeUndefined();

		expect(fetchPage).toHaveBeenLastCalledWith(1);
		expect(editReply).toHaveBeenCalledTimes(1);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ customId: "reminders:legacy-shape" }),
			"Unreadable paginator page, falling back to the first page",
		);
	});

	it("clamps a click pointing past a dataset that shrank since the message was sent", async () => {
		const fetchPage = createFetcher();
		const paginator = createPersistentPaginator({ customId: CUSTOM_ID, fetchPage });
		const { interaction } = createButtonClick(encodePaginatorPage(CUSTOM_ID, 12));

		await paginator.handler.handle(interaction, createRuntime());

		expect(fetchPage).toHaveBeenLastCalledWith(PAGE_COUNT);
	});

	it("ignores an interaction that is not a button", async () => {
		const fetchPage = createFetcher();
		const paginator = createPersistentPaginator({ customId: CUSTOM_ID, fetchPage });
		const modal = {
			customId: encodePaginatorPage(CUSTOM_ID, 2),
			isButton: () => false,
		} as unknown as RoutableInteraction;

		await paginator.handler.handle(modal, createRuntime());

		expect(fetchPage).not.toHaveBeenCalled();
	});
});

describe("createPersistentPaginator degenerate totals", () => {
	// A source that reports no page must not clamp the 1-based index to 0 and
	// refetch an index the caller was never told it could receive.
	it("never asks for a page below the first when the dataset is empty", async () => {
		const fetchPage = createFetcher(0);
		const paginator = createPersistentPaginator({ customId: CUSTOM_ID, fetchPage });

		const payload = asEmbeds(await paginator.render());

		expect(fetchPage).toHaveBeenCalledTimes(1);
		expect(fetchPage).toHaveBeenLastCalledWith(1);
		expect(payload.components).toEqual([]);
	});

	it("treats a non-finite total as a single page", async () => {
		const fetchPage = createFetcher(Number.NaN);
		const paginator = createPersistentPaginator({ customId: CUSTOM_ID, fetchPage });

		const payload = asEmbeds(await paginator.render());

		expect(fetchPage).toHaveBeenCalledTimes(1);
		expect(payload.components).toEqual([]);
	});
});
