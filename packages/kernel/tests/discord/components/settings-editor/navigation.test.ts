import { describe, expect, it } from "vitest";
import {
	canReturn,
	currentLevelKey,
	popLevel,
	pushLevel,
	ROOT_LEVEL_KEY,
} from "@/discord/components/settings-editor/navigation";

describe("settings editor navigation", () => {
	describe("the current level", () => {
		it("is the last one entered", () => {
			expect(currentLevelKey([ROOT_LEVEL_KEY, "roles", "welcome"])).toBe("welcome");
		});

		it("is the root on a path that has gone nowhere", () => {
			expect(currentLevelKey([ROOT_LEVEL_KEY])).toBe(ROOT_LEVEL_KEY);
		});
	});

	describe("whether there is anywhere to return to", () => {
		it("says no at the root — leaving it is what closing the screen does", () => {
			expect(canReturn([ROOT_LEVEL_KEY])).toBe(false);
		});

		it("says yes one level down", () => {
			expect(canReturn([ROOT_LEVEL_KEY, "roles"])).toBe(true);
		});
	});

	describe("descending", () => {
		it("adds the level to the path", () => {
			expect(pushLevel([ROOT_LEVEL_KEY], "roles")).toEqual([ROOT_LEVEL_KEY, "roles"]);
		});

		it("keeps the levels already entered", () => {
			expect(pushLevel([ROOT_LEVEL_KEY, "roles"], "welcome")).toEqual([
				ROOT_LEVEL_KEY,
				"roles",
				"welcome",
			]);
		});

		/**
		 * Otherwise a screen offering a shortcut back to a level already open would
		 * stack a second copy of it, and leaving that one place would take two
		 * clicks of a control that says it goes back once.
		 */
		it("unwinds to a level already on the path instead of stacking it twice", () => {
			expect(pushLevel([ROOT_LEVEL_KEY, "roles", "welcome"], "roles")).toEqual([
				ROOT_LEVEL_KEY,
				"roles",
			]);
		});

		it("unwinds all the way to the root when the root is re-entered", () => {
			expect(pushLevel([ROOT_LEVEL_KEY, "roles", "welcome"], ROOT_LEVEL_KEY)).toEqual([
				ROOT_LEVEL_KEY,
			]);
		});
	});

	describe("returning", () => {
		it("goes back exactly one level", () => {
			expect(popLevel([ROOT_LEVEL_KEY, "roles", "welcome"])).toEqual([ROOT_LEVEL_KEY, "roles"]);
		});

		/**
		 * The control is not rendered at the root, so this is unreachable through the
		 * screen. It still must not empty the path: every render reads the last entry,
		 * and an empty path would leave nothing to read.
		 */
		it("leaves the root standing rather than emptying the path", () => {
			expect(popLevel([ROOT_LEVEL_KEY])).toEqual([ROOT_LEVEL_KEY]);
		});
	});

	it("returns to where descending came from", () => {
		const start = [ROOT_LEVEL_KEY];
		expect(popLevel(pushLevel(start, "roles"))).toEqual(start);
	});
});
