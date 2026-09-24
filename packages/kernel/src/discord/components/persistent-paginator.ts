import type { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "discord.js";
import {
	type ComponentHandler,
	type ComponentRuntime,
	createComponentHandler,
	openToAnyone,
	type RoutableInteraction,
} from "@/discord/components/component-router";
import { toMessageEditOptions } from "@/discord/components/interactive-message/interactive-message-collector";
import {
	clampPage,
	isFirstPage,
	isLastPage,
	nextPage,
	type PageState,
	previousPage,
} from "@/discord/components/paginator/page-state";
import {
	type PaginatorLabels,
	resolveLabels,
} from "@/discord/components/paginator/paginator-buttons";
import type { PaginatorPayload } from "@/discord/components/paginator/paginator-view";
import { createActionRow, createButton } from "@/discord/interaction/button";

/** Separator the {@link ComponentRouter} already matches a handler prefix on. */
const ID_SEPARATOR = ":";
/** Marks the segment holding the encoded page, so other state can be added later. */
const PAGE_SEGMENT = "page";
/** Pages are 1-based, mirroring {@link PageState}. */
const FIRST_PAGE = 1;

/**
 * A page total is whatever the source reports, which may be 0 for an emptied
 * dataset or non-finite from a miscounted query. Both would push the 1-based
 * page index out of range, so treat them as a single empty page.
 */
function normalisePageCount(pageCount: number): number {
	if (!Number.isFinite(pageCount)) {
		return FIRST_PAGE;
	}
	return Math.max(FIRST_PAGE, Math.floor(pageCount));
}

/** One rendered page: what the caller's data source produces for a page index. */
export interface PersistentPage {
	embed: EmbedBuilder;
	/** Total number of pages, re-evaluated on every fetch since the data may have changed. */
	pageCount: number;
}

/**
 * Produces the page at `page` (1-based). Asynchronous and injected because a
 * persistent paginator cannot keep the dataset in memory: after a restart the
 * only surviving state is the customId, so every click re-reads the source.
 */
export type PersistentPageFetcher = (page: number) => Promise<PersistentPage>;

export interface PersistentPaginatorOptions {
	/** Handler prefix; navigation buttons extend it with the target page. */
	customId: string;
	fetchPage: PersistentPageFetcher;
	labels?: Partial<PaginatorLabels>;
}

export interface PersistentPaginator {
	readonly customId: string;
	/** Payload for the first message; the caller sends it however it replies. */
	render(page?: number): Promise<PaginatorPayload>;
	/** Register this on the module's `components` so clicks keep working after a restart. */
	readonly handler: ComponentHandler;
}

/** Build the customId a navigation button carries: `<prefix>:page:<n>`. */
export function encodePaginatorPage(customId: string, page: number): string {
	return [customId, PAGE_SEGMENT, String(page)].join(ID_SEPARATOR);
}

/**
 * Read the page back out of a clicked customId. Returns `null` for anything that
 * is not a well-formed page reference — a message from an older deploy may carry
 * a shape this build no longer writes, and that must not throw.
 */
export function decodePaginatorPage(customId: string, clickedId: string): number | null {
	const prefix = `${customId}${ID_SEPARATOR}${PAGE_SEGMENT}${ID_SEPARATOR}`;
	if (!clickedId.startsWith(prefix)) {
		return null;
	}
	const raw = clickedId.slice(prefix.length);
	// `Number` alone accepts "", " " and "1e3"; only plain digits are ours.
	if (!/^\d+$/.test(raw)) {
		return null;
	}
	const page = Number(raw);
	if (page < FIRST_PAGE) {
		return null;
	}
	return page;
}

/**
 * A paginator whose whole state lives in the component customId, routed by the
 * {@link ComponentRouter}. Unlike `mountPaginator` — a collector holding items
 * and page in a closure, owner-scoped and dead after an idle timeout — this one
 * has no memory: it survives restarts and never expires, at the cost of refetching
 * the page on every click. Use it for long-lived, shared messages; use the
 * collector for transient, single-user flows.
 */
export function createPersistentPaginator(
	options: PersistentPaginatorOptions,
): PersistentPaginator {
	const { customId, fetchPage } = options;
	const labels = resolveLabels(options.labels);

	function controls(state: PageState, count: number): ActionRowBuilder<ButtonBuilder>[] {
		// A single page has nothing to navigate to, so it carries no action row at all.
		if (count <= 1) {
			return [];
		}
		// No `onClick`: behaviour is carried by the encoded customId and resolved by
		// the router, which is what lets these buttons outlive the process.
		const buttons = [
			createButton<PageState>({
				id: encodePaginatorPage(customId, previousPage(state, count).page),
				label: labels.previous,
				emoji: labels.previousEmoji,
				style: "secondary",
				disabled: (current) => isFirstPage(current),
			}),
			createButton<PageState>({
				id: encodePaginatorPage(customId, nextPage(state, count).page),
				label: labels.next,
				emoji: labels.nextEmoji,
				style: "secondary",
				disabled: (current) => isLastPage(current, count),
			}),
		];
		return [createActionRow(buttons, state)];
	}

	/**
	 * Fetch a page, then clamp it against the freshly returned total. The total is
	 * only known after a fetch, so an out-of-range request (a stale button, a
	 * shrunken dataset) costs one extra read rather than an empty page.
	 */
	async function loadPage(requested: number): Promise<PaginatorPayload> {
		const asked = Math.max(requested, FIRST_PAGE);
		const fetched = await fetchPage(asked);
		// A source that reports no page (emptied dataset) or a nonsensical total
		// must not clamp the index to 0: the contract is 1-based, and refetching an
		// index the caller was never told it could receive is worse than rendering
		// the empty first page it already returned.
		const pageCount = normalisePageCount(fetched.pageCount);
		const page = clampPage(asked, pageCount);
		const resolved = page === asked ? fetched : await fetchPage(page);
		return {
			embeds: [resolved.embed],
			components: controls({ page }, normalisePageCount(resolved.pageCount)),
		};
	}

	async function handleClick(
		interaction: RoutableInteraction,
		runtime: ComponentRuntime,
	): Promise<void> {
		if (!interaction.isButton()) {
			return;
		}
		const decoded = decodePaginatorPage(customId, interaction.customId);
		if (decoded === null) {
			runtime.logger.warn(
				{ customId: interaction.customId },
				"Unreadable paginator page, falling back to the first page",
			);
		}
		// Acknowledge before fetching: a persistent paginator reads its source on
		// every click by design, and Discord invalidates an interaction left
		// unanswered for 3s — the click would be lost with the user still looking
		// at the stale page. `deferUpdate` buys the full edit window instead.
		await interaction.deferUpdate();
		const payload = await loadPage(decoded ?? FIRST_PAGE);
		await interaction.editReply(
			toMessageEditOptions(payload, [...interaction.message.attachments.values()]),
		);
	}

	return {
		customId,
		render: (page = FIRST_PAGE) => loadPage(page),
		handler: createComponentHandler({
			customId,
			// Navigation only re-renders what the message already showed to
			// whoever can see the channel; it grants no access of its own.
			authorize: openToAnyone("paging a message reveals nothing its reader could not already see"),
			handle: handleClick,
		}),
	};
}
