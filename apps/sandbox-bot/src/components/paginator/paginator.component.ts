import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { Options } from "@azurioh/discord-kernel/discord/command/options";
import { mountPaginator } from "@azurioh/discord-kernel/discord/components/paginator";
import type { Logger } from "@azurioh/discord-kernel/logger";
import { paginatorLabels } from "@/components/paginator/paginator.buttons";
import { createPaginatorRender } from "@/components/paginator/paginator.view";

/** How many lines the app shows on one page. */
const PAGE_SIZE = 5;

export interface PaginatorProps {
	/** The embed title, already translated. */
	readonly title: string;
	/** One line per item, already translated. */
	readonly items: readonly string[];
	/** Receives the collector's failures. */
	readonly logger: Logger;
}

/**
 * The app's paginator: the kernel's page state, buttons and collector, with
 * the app's labels, layout and defaults. Only the member who ran the command
 * can turn the pages.
 *
 * Call it on an already-deferred interaction.
 *
 * @param ctx - the command being answered; gives the interaction, its owner and language.
 * @param props - what to list and under which title.
 */
export async function showPaginator<O extends Options>(
	ctx: Context<O>,
	props: PaginatorProps,
): Promise<void> {
	await mountPaginator(ctx.interaction, {
		items: [...props.items],
		pageSize: PAGE_SIZE,
		ownerId: ctx.interaction.user.id,
		logger: props.logger,
		labels: paginatorLabels(ctx.t),
		render: createPaginatorRender(props.title, ctx.t),
	});
}
