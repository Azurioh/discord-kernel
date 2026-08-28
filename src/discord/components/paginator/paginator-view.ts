import type { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "discord.js";
import type {
	InteractiveMessagePayload,
	InteractiveView,
} from "@/discord/components/interactive-message";
import { type PageState, selectPageItems } from "@/discord/components/paginator/page-state";
import { type Button, createActionRow } from "@/discord/interaction/button";

/** Builds the embed shown for one page; supplied by the caller. */
export type PaginatorRender<T> = (
	pageItems: T[],
	page: number,
	count: number,
	total: number,
) => EmbedBuilder;

/**
 * The message payload shape shared by the initial reply and every update — the
 * generic interactive-message payload, named here for the paginator's callers.
 */
export type PaginatorPayload = InteractiveMessagePayload<PageState>;

export interface PaginatorViewDeps<T> {
	items: T[];
	pageSize: number;
	count: number;
	render: PaginatorRender<T>;
	buttons: Button<PageState>[];
}

/**
 * Turns a {@link PageState} into a message payload. Everything the paginator
 * sends to Discord goes through here, so the collector never builds a payload of
 * its own and the two renders can never drift apart.
 */
export type PaginatorView = InteractiveView<PageState>;

export function createPaginatorView<T>(deps: PaginatorViewDeps<T>): PaginatorView {
	const { items, pageSize, count, render, buttons } = deps;

	function controls(state: PageState, disableAll: boolean): ActionRowBuilder<ButtonBuilder>[] {
		// A single page has nothing to navigate to, so it carries no action row at all.
		if (count <= 1) {
			return [];
		}
		return [createActionRow(buttons, state, { disableAll })];
	}

	return {
		render(state) {
			const pageItems = selectPageItems(items, state, pageSize);
			return {
				embeds: [render(pageItems, state.page, count, items.length)],
				components: controls(state, false),
			};
		},
		disabledControls(state) {
			return { components: controls(state, true) };
		},
	};
}
