import { EmbedBuilder } from "discord.js";
import { describe, expectTypeOf, it } from "vitest";
import { createButton } from "@/discord/interaction/button";
import type { SectionNode, View } from "@/discord/view/view";

interface State {
	value: number;
}

const BUTTON = createButton<State>({ id: "go", label: "Go" });

describe("View types", () => {
	it("refuses embeds next to components", () => {
		// @ts-expect-error V1 and V2 fields cannot meet.
		const view: View = {
			embeds: [new EmbedBuilder()],
			components: [{ type: "text", content: "a" }],
		};
		expectTypeOf(view).toEqualTypeOf<View>();
	});

	it("refuses content next to components", () => {
		// @ts-expect-error V1 and V2 fields cannot meet.
		const view: View = { content: "a", components: [{ type: "text", content: "a" }] };
		expectTypeOf(view).toEqualTypeOf<View>();
	});

	it("refuses rows next to components", () => {
		// @ts-expect-error V1 and V2 fields cannot meet.
		const view: View<State> = {
			rows: [{ type: "buttons", buttons: [BUTTON] }],
			components: [{ type: "text", content: "a" }],
		};
		expectTypeOf(view).toEqualTypeOf<View<State>>();
	});

	it("refuses a container inside a container", () => {
		const view: View = {
			components: [
				{
					type: "container",
					// @ts-expect-error a container cannot hold a container.
					children: [{ type: "container", children: [{ type: "text", content: "a" }] }],
				},
			],
		};
		expectTypeOf(view).toEqualTypeOf<View>();
	});

	it("refuses a section without texts or with four", () => {
		const empty: SectionNode = {
			type: "section",
			// @ts-expect-error a section holds at least one text.
			texts: [],
			accessory: { thumbnail: { url: "u" } },
		};
		const four: SectionNode = {
			type: "section",
			// @ts-expect-error a section holds at most three texts.
			texts: ["a", "b", "c", "d"],
			accessory: { thumbnail: { url: "u" } },
		};
		expectTypeOf(empty).toEqualTypeOf<SectionNode>();
		expectTypeOf(four).toEqualTypeOf<SectionNode>();
	});

	it("refuses a section carrying both accessories", () => {
		const section: SectionNode<State> = {
			type: "section",
			texts: ["a"],
			// @ts-expect-error a section has exactly one accessory.
			accessory: { button: BUTTON, thumbnail: { url: "u" } },
		};
		expectTypeOf(section).toEqualTypeOf<SectionNode<State>>();
	});

	it("refuses a section without accessory", () => {
		// @ts-expect-error a section requires an accessory.
		const section: SectionNode = { type: "section", texts: ["a"] };
		expectTypeOf(section).toEqualTypeOf<SectionNode>();
	});

	it("accepts a view without buttons and no type argument", () => {
		const v1 = { embeds: [new EmbedBuilder()] };
		const v2 = { components: [{ type: "text", content: "a" }] } as const;
		expectTypeOf(v1).toExtend<View>();
		expectTypeOf(v2).toExtend<View>();
	});
});
