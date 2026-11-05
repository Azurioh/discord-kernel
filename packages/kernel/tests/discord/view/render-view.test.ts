import {
	type Attachment,
	ButtonStyle,
	ComponentType,
	ContainerBuilder,
	EmbedBuilder,
	type InteractionEditReplyOptions,
	type InteractionReplyOptions,
	type InteractionUpdateOptions,
	MessageFlags,
	MessageFlagsBitField,
	SeparatorSpacingSize,
} from "discord.js";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createButton } from "@/discord/interaction/button";
import { createStringSelect } from "@/discord/interaction/select-menu";
import { type RenderedMessage, type RenderedReply, renderView } from "@/discord/view/render-view";
import type { V2Component, View } from "@/discord/view/view";
import { ViewLayoutSwitchError, ViewLimitError } from "@/discord/view/view-errors";
import { MAX_V2_COMPONENTS } from "@/discord/view/view-limits";
import { captureError } from "@/testing/capture-error";

interface State {
	value: number;
}

const STATE: State = { value: 1 };

const GO = createButton<State>({
	id: "go",
	label: "Go",
	style: "primary",
	disabled: (state) => state.value > 5,
});

const STOP = createButton<State>({ id: "stop", label: "Stop" });

const PICK = createStringSelect({ id: "pick", options: [{ label: "A", value: "a" }] });

/** Only `name` is read from an attachment; discord.js gives no public constructor. */
function attachment(name: string): Attachment {
	return { name } as unknown as Attachment;
}

/** The JSON of every top-level component, as Discord receives it. */
function json(message: RenderedMessage): unknown[] {
	return message.components.map((component) => component.toJSON());
}

/** The JSON of the single top-level component a V2 view compiled to. */
function only(components: readonly (V2Component<State> | null)[], disabled = false): unknown {
	const [first, ...rest] = json(renderView<State>({ components }, { state: STATE, disabled }));
	expect(rest).toHaveLength(0);
	return first;
}

function hasFlag(message: RenderedMessage | RenderedReply, flag: MessageFlags): boolean {
	return message.flags !== undefined && new MessageFlagsBitField(message.flags).has(flag);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("renderView: V2 nodes", () => {
	it("compiles a text node to a text display", () => {
		expect(only([{ type: "text", content: "Hello" }])).toEqual({
			type: ComponentType.TextDisplay,
			content: "Hello",
		});
	});

	it("compiles a container with its accent, spoiler and children", () => {
		expect(
			only([
				{
					type: "container",
					accent: 0xff0000,
					spoiler: true,
					children: [{ type: "text", content: "a" }],
				},
			]),
		).toEqual({
			type: ComponentType.Container,
			accent_color: 0xff0000,
			spoiler: true,
			components: [{ type: ComponentType.TextDisplay, content: "a" }],
		});
	});

	it.each([[["a"]], [["a", "b"]], [["a", "b", "c"]]] as const)(
		"compiles a section with texts %j and a button accessory",
		(texts) => {
			expect(only([{ type: "section", texts, accessory: { button: GO } }])).toEqual({
				type: ComponentType.Section,
				components: texts.map((content) => ({ type: ComponentType.TextDisplay, content })),
				accessory: GO.apply(STATE, false).toJSON(),
			});
		},
	);

	it("renders a section's button through apply(state, disabled)", () => {
		const apply = vi.spyOn(GO, "apply");

		renderView<State>(
			{ components: [{ type: "section", texts: ["a"], accessory: { button: GO } }] },
			{ state: STATE, disabled: true },
		);

		expect(apply).toHaveBeenCalledWith(STATE, true);
	});

	it("compiles a section with a thumbnail accessory", () => {
		expect(
			only([
				{
					type: "section",
					texts: ["a"],
					accessory: {
						thumbnail: { url: "https://example.com/a.png", description: "d", spoiler: true },
					},
				},
			]),
		).toEqual({
			type: ComponentType.Section,
			components: [{ type: ComponentType.TextDisplay, content: "a" }],
			accessory: {
				type: ComponentType.Thumbnail,
				media: { url: "https://example.com/a.png" },
				description: "d",
				spoiler: true,
			},
		});
	});

	it.each([
		["small", SeparatorSpacingSize.Small],
		["large", SeparatorSpacingSize.Large],
	] as const)("compiles a %s separator", (spacing, size) => {
		expect(only([{ type: "separator", spacing, divider: false }])).toEqual({
			type: ComponentType.Separator,
			spacing: size,
			divider: false,
		});
	});

	it("compiles a bare separator with Discord's defaults", () => {
		expect(only([{ type: "separator" }])).toEqual({ type: ComponentType.Separator });
	});

	it("compiles a gallery with its items", () => {
		expect(
			only([
				{
					type: "gallery",
					items: [
						{ url: "https://example.com/a.png" },
						{ url: "https://example.com/b.png", description: "b", spoiler: true },
					],
				},
			]),
		).toEqual({
			type: ComponentType.MediaGallery,
			items: [
				{ media: { url: "https://example.com/a.png" } },
				{ media: { url: "https://example.com/b.png" }, description: "b", spoiler: true },
			],
		});
	});

	it("compiles a file to its attachment:// reference", () => {
		const message = renderView(
			{ components: [{ type: "file", name: "a.txt", spoiler: true }] },
			{ attachments: [attachment("a.txt")] },
		);

		expect(json(message)).toEqual([
			{ type: ComponentType.File, file: { url: "attachment://a.txt" }, spoiler: true },
		]);
	});

	it("compiles a buttons row like createActionRow", () => {
		expect(only([{ type: "buttons", buttons: [GO, STOP] }])).toEqual({
			type: ComponentType.ActionRow,
			components: [
				{
					type: ComponentType.Button,
					custom_id: "go",
					label: "Go",
					style: ButtonStyle.Primary,
					disabled: false,
				},
				{
					type: ComponentType.Button,
					custom_id: "stop",
					label: "Stop",
					style: ButtonStyle.Secondary,
					disabled: false,
				},
			],
		});
	});

	it("compiles a select row through menu.apply(disabled)", () => {
		const apply = vi.spyOn(PICK, "apply");

		const row = only([{ type: "select", menu: PICK }], true);

		expect(apply).toHaveBeenCalledWith(true);
		expect(row).toEqual({ type: ComponentType.ActionRow, components: [PICK.apply(true).toJSON()] });
	});

	it("keeps order and skips nulls at the top level and in containers", () => {
		const message = renderView(
			{
				components: [
					{ type: "text", content: "1" },
					null,
					{
						type: "container",
						children: [{ type: "text", content: "2" }, null, { type: "text", content: "3" }],
					},
					{ type: "text", content: "4" },
				],
			},
			{},
		);

		expect(json(message)).toEqual([
			{ type: ComponentType.TextDisplay, content: "1" },
			{
				type: ComponentType.Container,
				components: [
					{ type: ComponentType.TextDisplay, content: "2" },
					{ type: ComponentType.TextDisplay, content: "3" },
				],
			},
			{ type: ComponentType.TextDisplay, content: "4" },
		]);
	});
});

describe("renderView: disabled", () => {
	const disabledOf = (component: unknown): boolean[] =>
		JSON.stringify(component)
			.match(/"disabled":(true|false)/g)
			?.map((match) => match.endsWith("true")) ?? [];

	it("disables every button and select of a V2 view", () => {
		const message = renderView<State>(
			{
				components: [
					{ type: "buttons", buttons: [GO, STOP] },
					{
						type: "container",
						children: [
							{ type: "section", texts: ["a"], accessory: { button: GO } },
							{ type: "select", menu: PICK },
						],
					},
				],
			},
			{ state: STATE, disabled: true },
		);

		const flags = disabledOf(json(message));
		expect(flags).toHaveLength(4);
		expect(flags.every(Boolean)).toBe(true);
	});

	it("disables every button and select of a V1 view", () => {
		const message = renderView<State>(
			{
				rows: [
					{ type: "buttons", buttons: [GO, STOP] },
					{ type: "select", menu: PICK },
				],
			},
			{ state: STATE, disabled: true },
		);

		const flags = disabledOf(json(message));
		expect(flags).toHaveLength(3);
		expect(flags.every(Boolean)).toBe(true);
	});
});

describe("renderView: layouts and flags", () => {
	const V2: View = { components: [{ type: "text", content: "a" }] };
	const V1: View<State> = {
		content: "hello",
		embeds: [new EmbedBuilder().setTitle("t")],
		rows: [{ type: "buttons", buttons: [GO] }],
	};

	it("flags a V2 message and carries no content or embeds", () => {
		const message = renderView(V2, {});

		expect(hasFlag(message, MessageFlags.IsComponentsV2)).toBe(true);
		expect(hasFlag(message, MessageFlags.Ephemeral)).toBe(false);
		expect(message).not.toHaveProperty("content");
		expect(message).not.toHaveProperty("embeds");
	});

	it("flags an ephemeral V2 message with both flags", () => {
		const message = renderView(V2, { ephemeral: true });

		expect(hasFlag(message, MessageFlags.IsComponentsV2)).toBe(true);
		expect(hasFlag(message, MessageFlags.Ephemeral)).toBe(true);
	});

	it("renders a V1 message with content, embeds and rows and no V2 flag", () => {
		const message = renderView(V1, { state: STATE });

		expect(message).not.toHaveProperty("flags");
		expect(message.content).toBe("hello");
		expect(message.embeds).toEqual(V1.embeds);
		expect(json(message)).toEqual([
			{ type: ComponentType.ActionRow, components: [GO.apply(STATE, false).toJSON()] },
		]);
	});

	it("flags an ephemeral V1 message as Ephemeral only", () => {
		const message = renderView(V1, { state: STATE, ephemeral: true });

		expect(hasFlag(message, MessageFlags.Ephemeral)).toBe(true);
		expect(hasFlag(message, MessageFlags.IsComponentsV2)).toBe(false);
	});

	it("is assignable to every send kind, ephemeral to reply and follow-up only", () => {
		expectTypeOf(renderView(V2, {})).toExtend<InteractionReplyOptions>();
		expectTypeOf(renderView(V2, {})).toExtend<InteractionEditReplyOptions>();
		expectTypeOf(renderView(V2, {})).toExtend<InteractionUpdateOptions>();
		expectTypeOf(renderView(V2, { ephemeral: true })).toExtend<InteractionReplyOptions>();
		expectTypeOf(renderView(V2, { ephemeral: true })).not.toExtend<InteractionUpdateOptions>();
	});

	it("refuses a V1 view over a V2 message", () => {
		expect(() => renderView(V1, { state: STATE, previous: "v2" })).toThrow(ViewLayoutSwitchError);
	});

	it("accepts a V2 view over a V1 message", () => {
		expect(() => renderView(V2, { previous: "v1" })).not.toThrow();
	});
});

describe("renderView: files and mentions", () => {
	const FILE = { name: "a.png", bytes: new Uint8Array([1, 2, 3]) };

	it("uploads a file the message does not carry yet", () => {
		const message = renderView({ embeds: [new EmbedBuilder()], files: [FILE] }, {});

		expect(message.attachments).toEqual([]);
		expect(message.files).toEqual([{ attachment: Buffer.from(FILE.bytes), name: "a.png" }]);
	});

	it("keeps a file the message already carries instead of uploading it again", () => {
		const existing = attachment("a.png");

		const message = renderView(
			{ embeds: [new EmbedBuilder()], files: [FILE] },
			{ attachments: [existing] },
		);

		expect(message.attachments).toEqual([existing]);
		expect(message.files).toEqual([]);
	});

	it("leaves the message's attachments alone when files are left out", () => {
		const message = renderView(
			{ embeds: [new EmbedBuilder()] },
			{ attachments: [attachment("a.png")] },
		);

		expect(message).not.toHaveProperty("files");
		expect(message).not.toHaveProperty("attachments");
	});

	it("passes allowedMentions through", () => {
		const allowedMentions = { parse: [] };

		expect(renderView({ content: "<@1>", allowedMentions }, {}).allowedMentions).toBe(
			allowedMentions,
		);
		expect(renderView({ content: "x" }, {})).not.toHaveProperty("allowedMentions");
	});
});

describe("renderView: validation", () => {
	it("refuses an invalid view before any builder runs", async () => {
		const addText = vi.spyOn(ContainerBuilder.prototype, "addTextDisplayComponents");
		const apply = vi.spyOn(GO, "apply");
		const children = Array.from(
			{ length: MAX_V2_COMPONENTS },
			() => ({ type: "text", content: "a" }) as const,
		);

		const error = await captureError(async () =>
			renderView<State>(
				{
					components: [
						{ type: "buttons", buttons: [GO] },
						{ type: "container", children },
					],
				},
				{ state: STATE },
			),
		);

		expect(error).toBeInstanceOf(ViewLimitError);
		expect(addText).not.toHaveBeenCalled();
		expect(apply).not.toHaveBeenCalled();
	});
});
