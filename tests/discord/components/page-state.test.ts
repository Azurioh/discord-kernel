import { describe, expect, it } from "vitest";
import {
	clampPage,
	createPageState,
	isFirstPage,
	isLastPage,
	nextPage,
	pageCount,
	previousPage,
	selectPageItems,
} from "@/discord/components/paginator";

describe("pageCount", () => {
	it("rounds partial pages up", () => {
		expect(pageCount(10, 4)).toBe(3);
	});

	it("returns an exact count when the collection divides evenly", () => {
		expect(pageCount(12, 4)).toBe(3);
	});

	it("never drops below one page, even for an empty collection", () => {
		expect(pageCount(0, 5)).toBe(1);
	});
});

describe("clampPage", () => {
	it("keeps a page inside the range untouched", () => {
		expect(clampPage(2, 3)).toBe(2);
	});

	it("clamps below the first page", () => {
		expect(clampPage(-4, 3)).toBe(1);
	});

	it("clamps above the last page", () => {
		expect(clampPage(9, 3)).toBe(3);
	});
});

describe("createPageState", () => {
	it("starts on the requested page", () => {
		expect(createPageState(2, 4)).toEqual({ page: 2 });
	});

	it("clamps an out-of-range initial page", () => {
		expect(createPageState(99, 4)).toEqual({ page: 4 });
	});
});

describe("page transitions", () => {
	it("moves forward and backward", () => {
		const first = createPageState(1, 3);
		const second = nextPage(first, 3);
		expect(second).toEqual({ page: 2 });
		expect(previousPage(second, 3)).toEqual({ page: 1 });
	});

	it("stops at the last page", () => {
		expect(nextPage({ page: 3 }, 3)).toEqual({ page: 3 });
	});

	it("stops at the first page", () => {
		expect(previousPage({ page: 1 }, 3)).toEqual({ page: 1 });
	});

	it("does not mutate the previous state", () => {
		const state = { page: 2 };
		nextPage(state, 3);
		expect(state).toEqual({ page: 2 });
	});
});

describe("boundary predicates", () => {
	it("flags the first page", () => {
		expect(isFirstPage({ page: 1 })).toBe(true);
		expect(isFirstPage({ page: 2 })).toBe(false);
	});

	it("flags the last page", () => {
		expect(isLastPage({ page: 3 }, 3)).toBe(true);
		expect(isLastPage({ page: 2 }, 3)).toBe(false);
	});
});

describe("selectPageItems", () => {
	const items = ["a", "b", "c", "d", "e"];

	it("returns the slice for the current page", () => {
		expect(selectPageItems(items, { page: 2 }, 2)).toEqual(["c", "d"]);
	});

	it("returns a short last page", () => {
		expect(selectPageItems(items, { page: 3 }, 2)).toEqual(["e"]);
	});
});
