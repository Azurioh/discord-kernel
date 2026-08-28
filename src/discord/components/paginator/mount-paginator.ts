import type { ChatInputCommandInteraction } from "discord.js";
import {
	COLLECTOR_IDLE_MS,
	createStateStore,
	mountInteractiveMessageCollector,
	toMessageEditOptions,
} from "@/discord/components/interactive-message";
import { createPageState, pageCount } from "@/discord/components/paginator/page-state";
import {
	createPaginatorButtons,
	type PaginatorLabels,
	resolveLabels,
} from "@/discord/components/paginator/paginator-buttons";
import {
	createPaginatorView,
	type PaginatorRender,
} from "@/discord/components/paginator/paginator-view";
import type { Logger } from "@/logger";

export interface PaginatorOptions<T> {
	items: T[];
	pageSize: number;
	ownerId: string;
	logger: Logger;
	initialPage?: number;
	idleMs?: number;
	labels?: Partial<PaginatorLabels>;
	render: PaginatorRender<T>;
}

/**
 * A composed component: an embed plus previous/next buttons plus a collector.
 * The collector itself is the generic
 * {@link import("@/discord/components/interactive-message").mountInteractiveMessageCollector} —
 * this module only contributes what is specific to pagination: the page state,
 * the navigation buttons and the page view.
 *
 * Call it on an already-deferred interaction.
 */
export async function mountPaginator<T>(
	interaction: ChatInputCommandInteraction,
	options: PaginatorOptions<T>,
): Promise<void> {
	const { items, pageSize, ownerId, render, logger } = options;
	const count = pageCount(items.length, pageSize);
	const store = createStateStore(createPageState(options.initialPage ?? 1, count));
	const buttons = createPaginatorButtons(count, resolveLabels(options.labels));
	const view = createPaginatorView({ items, pageSize, count, render, buttons });

	const response = await interaction.editReply(toMessageEditOptions(view.render(store.read()), []));

	// A single page has nothing to navigate to, so it needs no collector at all —
	// a pagination-specific rule, which is why it lives here and not in the
	// generic mechanism.
	if (count <= 1) {
		return;
	}

	mountInteractiveMessageCollector({
		interaction,
		response,
		buttons,
		view,
		store,
		ownerId,
		idleMs: options.idleMs ?? COLLECTOR_IDLE_MS,
		logger,
	});
}
