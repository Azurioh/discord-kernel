import {
	isFirstPage,
	isLastPage,
	nextPage,
	type PageState,
	previousPage,
} from "@/discord/components/paginator/page-state";
import { type Button, createButton } from "@/discord/interaction/button";

/** Custom IDs of the two navigation buttons; also what the collector routes on. */
const PREV_ID = "paginator:prev";
const NEXT_ID = "paginator:next";

export interface PaginatorLabels {
	previous: string;
	next: string;
	previousEmoji?: string;
	nextEmoji?: string;
}

const DEFAULT_LABELS: PaginatorLabels = {
	previous: "Previous",
	next: "Next",
	previousEmoji: "◀️",
	nextEmoji: "▶️",
};

/** Complete a caller's partial labels with the defaults. */
export function resolveLabels(labels?: Partial<PaginatorLabels>): PaginatorLabels {
	return { ...DEFAULT_LABELS, ...labels };
}

/**
 * The navigation buttons, bound to a fixed page count. Each button carries its
 * own disabled predicate and transition, so the collector only has to hand a
 * click to the matching button instead of knowing what the click means.
 */
export function createPaginatorButtons(
	count: number,
	labels: PaginatorLabels,
): Button<PageState>[] {
	return [
		createButton<PageState>({
			id: PREV_ID,
			label: labels.previous,
			emoji: labels.previousEmoji,
			style: "secondary",
			disabled: (current) => isFirstPage(current),
			onClick: (ctx) => ctx.update(previousPage(ctx.state, count)),
		}),
		createButton<PageState>({
			id: NEXT_ID,
			label: labels.next,
			emoji: labels.nextEmoji,
			style: "secondary",
			disabled: (current) => isLastPage(current, count),
			onClick: (ctx) => ctx.update(nextPage(ctx.state, count)),
		}),
	];
}
