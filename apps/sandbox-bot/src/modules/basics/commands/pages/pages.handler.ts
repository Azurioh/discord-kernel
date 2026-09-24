import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { Options } from "@azurioh/discord-kernel/discord/command/options";
import { mountPaginator } from "@azurioh/discord-kernel/discord/components/paginator";
import { EMBED_COLORS } from "@azurioh/discord-kernel/discord/ui/colors";
import { buildEmbed } from "@azurioh/discord-kernel/discord/ui/embed";
import type { Logger } from "@azurioh/discord-kernel/logger";
import { BASICS_MESSAGES } from "@/modules/basics/i18n/basics-messages";

const ITEM_COUNT = 42;
const PAGE_SIZE = 5;

/**
 * `/pages`: mount a paginator over a generated list, owned by the caller.
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
		await mountPaginator(ctx.interaction, {
			items,
			pageSize: PAGE_SIZE,
			ownerId: ctx.interaction.user.id,
			logger,
			labels: {
				previous: ctx.t(BASICS_MESSAGES.pagesPrevious),
				next: ctx.t(BASICS_MESSAGES.pagesNext),
			},
			render: (pageItems, page, count, total) =>
				buildEmbed(ctx.t(BASICS_MESSAGES.pagesTitle), pageItems.join("\n"))
					.setColor(EMBED_COLORS.neutral)
					.setFooter({ text: ctx.t(BASICS_MESSAGES.pagesFooter, { page, count, total }) }),
		});
	};
}
