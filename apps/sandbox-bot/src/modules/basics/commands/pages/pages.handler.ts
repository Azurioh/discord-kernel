import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { Options } from "@azurioh/discord-kernel/discord/command/options";
import type { Logger } from "@azurioh/discord-kernel/logger";
import { showPaginator } from "@/components/paginator/paginator.component";
import { BASICS_MESSAGES } from "@/modules/basics/i18n/basics.messages";

const ITEM_COUNT = 42;

/**
 * `/pages`: show the app's paginator over a generated list, owned by the caller.
 *
 * @param logger - receives the paginator's failures.
 */
export function createPagesHandler(
	logger: Logger,
): <O extends Options>(ctx: Context<O>) => Promise<void> {
	return async (ctx) => {
		const items = Array.from({ length: ITEM_COUNT }, (_, index) =>
			ctx.t(BASICS_MESSAGES.pagesItem, { index: index + 1 }),
		);
		await showPaginator(ctx, { title: ctx.t(BASICS_MESSAGES.pagesTitle), items, logger });
	};
}
