import { ComponentType } from "discord.js";
import { describe, expect, it } from "vitest";
import type { InteractiveMessagePayload } from "@/discord/components/interactive-message";
import { createButton } from "@/discord/interaction/button";
import { createStringSelect } from "@/discord/interaction/select-menu";
import {
	type CardBlock,
	createCard,
	MAX_CARD_COMPONENTS,
	MAX_CARD_TEXT_CHARACTERS,
} from "@/discord/ui/card";

interface CardJson {
	type: ComponentType;
	accent_color?: number;
	components: ComponentJson[];
}

interface ComponentJson {
	type: ComponentType;
	content?: string;
	custom_id?: string;
	disabled?: boolean;
	accessory?: ComponentJson;
	components?: ComponentJson[];
	media?: { url: string };
	description?: string;
	spoiler?: boolean;
}

interface State {
	value: number;
}

const STATE: State = { value: 1 };

describe("createCard", () => {
	it("renders a bare entry — no action, no thumbnail — as a TextDisplay", () => {
		const card = createCard<State>({
			blocks: [{ kind: "entry", title: "Season", lines: ["Week 3", "8 teams left"] }],
		});

		const json = card.apply(STATE).toJSON() as CardJson;

		expect(json.components).toHaveLength(1);
		expect(json.components[0]).toMatchObject({
			type: ComponentType.TextDisplay,
			content: "**Season**\nWeek 3\n8 teams left",
		});
	});

	it("renders an entry with an action as a Section carrying a button accessory", () => {
		const action = createButton<State>({ id: "join", label: "Join" });
		const card = createCard<State>({
			blocks: [{ kind: "entry", title: "Tournament", action }],
		});

		const json = card.apply(STATE).toJSON() as CardJson;

		expect(json.components).toHaveLength(1);
		const section = json.components[0];
		expect(section?.type).toBe(ComponentType.Section);
		expect(section?.components).toEqual([
			{ type: ComponentType.TextDisplay, content: "**Tournament**" },
		]);
		expect(section?.accessory).toMatchObject({ type: ComponentType.Button, custom_id: "join" });
	});

	it("renders an entry with a thumbnail as a Section carrying a thumbnail accessory", () => {
		const card = createCard<State>({
			blocks: [{ kind: "entry", title: "Bracket", thumbnail: "attachment://bracket.png" }],
		});

		const json = card.apply(STATE).toJSON() as CardJson;

		const section = json.components[0];
		expect(section?.type).toBe(ComponentType.Section);
		expect(section?.accessory).toMatchObject({
			type: ComponentType.Thumbnail,
			media: { url: "attachment://bracket.png" },
		});
	});

	it("skips a null block, at the position it would have occupied", () => {
		const card = createCard<State>({
			blocks: [{ kind: "text", content: "Before" }, null, { kind: "text", content: "After" }],
		});

		const json = card.apply(STATE).toJSON() as CardJson;

		expect(json.components.map((component) => component.content)).toEqual(["Before", "After"]);
	});

	it("carries its accent colour onto the container", () => {
		const card = createCard<State>({
			accent: 0xffd700,
			blocks: [{ kind: "text", content: "Gold" }],
		});

		expect((card.apply(STATE).toJSON() as CardJson).accent_color).toBe(0xffd700);
	});

	it("force-disables both a controls button row and a select menu", () => {
		const button = createButton<State>({ id: "confirm", label: "Confirm" });
		const menu = createStringSelect({ id: "pick", options: [{ label: "One", value: "1" }] });
		const card = createCard<State>({
			blocks: [
				{ kind: "controls", buttons: [button] },
				{ kind: "select", menu },
			],
		});

		const enabled = card.apply(STATE).toJSON() as CardJson;
		const disabled = card.apply(STATE, true).toJSON() as CardJson;

		const buttonJson = (json: CardJson) => json.components[0]?.components?.[0];
		const selectJson = (json: CardJson) => json.components[1]?.components?.[0];

		expect(buttonJson(enabled)?.disabled).toBe(false);
		expect(buttonJson(disabled)?.disabled).toBe(true);
		expect(selectJson(enabled)?.disabled).toBe(false);
		expect(selectJson(disabled)?.disabled).toBe(true);
	});

	it("refuses a card over the 40-component budget, naming the overage", () => {
		// Each `controls` block with 5 buttons costs 6 components (the row plus
		// every button); the container itself is one more. Eight of them is 49 —
		// 9 over the 40-component cap.
		const blocks: CardBlock<State>[] = Array.from({ length: 8 }, (_, rowIndex) => ({
			kind: "controls" as const,
			buttons: Array.from({ length: 5 }, (_, buttonIndex) =>
				createButton<State>({ id: `row-${rowIndex}-button-${buttonIndex}` }),
			),
		}));

		expect(() => createCard<State>({ blocks })).toThrow(/49 components.*40.*9 over/s);
	});

	it("refuses a card over the 4000-character text budget, naming the overage", () => {
		const blocks: CardBlock<State>[] = [
			{ kind: "text", content: "x".repeat(MAX_CARD_TEXT_CHARACTERS + 137) },
		];

		expect(() => createCard<State>({ blocks })).toThrow(
			new RegExp(`${MAX_CARD_TEXT_CHARACTERS + 137}.*${MAX_CARD_TEXT_CHARACTERS}.*137 over`, "s"),
		);
	});

	it("stays under the component budget with a card at exactly the cap", () => {
		// 39 bare text blocks plus the container itself lands exactly on the cap.
		const blocks: CardBlock<State>[] = Array.from(
			{ length: MAX_CARD_COMPONENTS - 1 },
			(_, index) => ({
				kind: "text" as const,
				content: `line ${index}`,
			}),
		);

		expect(() => createCard<State>({ blocks })).not.toThrow();
	});
});

describe("InteractiveMessagePayload backward compatibility", () => {
	/**
	 * `layout` is optional on the "embeds" branch precisely so that a payload
	 * predating the card layout — no `layout` key at all — keeps satisfying the
	 * type. This locks that in: it would fail to compile, not just to run, if
	 * the branch ever stopped being optional.
	 */
	it("accepts an embeds payload that never names its own layout", () => {
		const legacyShaped: InteractiveMessagePayload<State> = {
			embeds: [],
			components: [],
		};

		expect(legacyShaped.embeds).toEqual([]);
		expect(legacyShaped.components).toEqual([]);
	});
});
