/** What the paginator remembers between two clicks: the page being displayed (1-based). */
export interface PageState {
	page: number;
}

/** Total number of pages for a collection, never below 1. */
export function pageCount(total: number, pageSize: number): number {
	return Math.max(1, Math.ceil(total / pageSize));
}

/** Clamp a page number into the valid `[1, count]` range. */
export function clampPage(page: number, count: number): number {
	return Math.min(Math.max(page, 1), count);
}

/** Opening state, clamped so a caller-supplied out-of-range page stays valid. */
export function createPageState(page: number, count: number): PageState {
	return { page: clampPage(page, count) };
}

/** Transition one page back; a no-op on the first page. */
export function previousPage(state: PageState, count: number): PageState {
	return { page: clampPage(state.page - 1, count) };
}

/** Transition one page forward; a no-op on the last page. */
export function nextPage(state: PageState, count: number): PageState {
	return { page: clampPage(state.page + 1, count) };
}

/** Whether the "previous" affordance has nothing left to go back to. */
export function isFirstPage(state: PageState): boolean {
	return state.page <= 1;
}

/** Whether the "next" affordance has nothing left to go forward to. */
export function isLastPage(state: PageState, count: number): boolean {
	return state.page >= count;
}

/** Slice of the collection visible on the current page. */
export function selectPageItems<T>(items: T[], state: PageState, pageSize: number): T[] {
	const start = (state.page - 1) * pageSize;
	return items.slice(start, start + pageSize);
}
