import { type Attachment, EmbedBuilder } from "discord.js";
import { describe, expect, it } from "vitest";
import { type Button, createButton } from "@/discord/interaction/button";
import { validateView } from "@/discord/view/validate-view";
import type { MediaItem, TextNode, View } from "@/discord/view/view";
import { EmptyViewError, MissingAttachmentError, ViewLimitError } from "@/discord/view/view-errors";
import {
	MAX_GALLERY_ITEMS,
	MAX_MEDIA_DESCRIPTION,
	MAX_MESSAGE_EMBEDS,
	MAX_MESSAGE_ROWS,
	MAX_ROW_BUTTONS,
	MAX_V2_COMPONENTS,
	MAX_V2_TEXT_CHARACTERS,
} from "@/discord/view/view-limits";
import { captureError } from "@/testing/capture-error";

interface State {
	value: number;
}

function buttons(count: number): Button<State>[] {
	return Array.from({ length: count }, (_, index) => createButton<State>({ id: `b${index}` }));
}

function texts(count: number): TextNode[] {
	return Array.from({ length: count }, () => ({ type: "text", content: "a" }));
}

function media(count: number, description?: string): MediaItem[] {
	return Array.from({ length: count }, () => ({ url: "https://example.com/a.png", description }));
}

/** Only `name` is read from an attachment; discord.js gives no public constructor. */
function attachment(name: string): Attachment {
	return { name } as unknown as Attachment;
}

/** The `ViewLimitError` validating `view` throws. */
async function limitOf<S>(
	view: View<S>,
	attachments: readonly Attachment[] = [],
): Promise<ViewLimitError> {
	const error = await captureError(async () => validateView(view, attachments));
	expect(error).toBeInstanceOf(ViewLimitError);
	return error as ViewLimitError;
}

describe("validateView", () => {
	it("refuses more than MAX_V2_COMPONENTS components, nested ones counted", async () => {
		// One container plus 40 children: 41 components.
		const view: View = { components: [{ type: "container", children: texts(MAX_V2_COMPONENTS) }] };

		const error = await limitOf(view);

		expect(error).toMatchObject({ limit: "MAX_V2_COMPONENTS", actual: 41, max: MAX_V2_COMPONENTS });
	});

	it("counts a section's texts and accessory and a row's buttons", async () => {
		const view: View<State> = {
			components: [
				...texts(MAX_V2_COMPONENTS - 9),
				// Section + 2 texts + accessory = 4; row + 5 buttons = 6: 10 over 9.
				{
					type: "section",
					texts: ["a", "b"],
					accessory: { button: createButton<State>({ id: "s" }) },
				},
				{ type: "buttons", buttons: buttons(5) },
			],
		};

		expect(await limitOf(view)).toMatchObject({ actual: MAX_V2_COMPONENTS + 1 });
	});

	it("passes exactly MAX_V2_COMPONENTS components", async () => {
		const view: View = {
			components: [{ type: "container", children: texts(MAX_V2_COMPONENTS - 1) }],
		};

		expect(() => validateView(view, [])).not.toThrow();
	});

	it("refuses more than MAX_V2_TEXT_CHARACTERS across texts and section texts", async () => {
		const view: View = {
			components: [
				{ type: "text", content: "a".repeat(3000) },
				{
					type: "container",
					children: [
						{
							type: "section",
							texts: ["b".repeat(500), "c".repeat(501)],
							accessory: { thumbnail: { url: "u" } },
						},
					],
				},
			],
		};

		expect(await limitOf(view)).toMatchObject({
			limit: "MAX_V2_TEXT_CHARACTERS",
			actual: MAX_V2_TEXT_CHARACTERS + 1,
			max: MAX_V2_TEXT_CHARACTERS,
		});
	});

	it("passes exactly MAX_V2_TEXT_CHARACTERS", async () => {
		const view: View = {
			components: [{ type: "text", content: "a".repeat(MAX_V2_TEXT_CHARACTERS) }],
		};

		expect(() => validateView(view, [])).not.toThrow();
	});

	it.each([0, MAX_GALLERY_ITEMS + 1])("refuses a gallery of %i items", async (count) => {
		const view: View = { components: [{ type: "gallery", items: media(count) }] };

		expect(await limitOf(view)).toMatchObject({
			limit: "MAX_GALLERY_ITEMS",
			actual: count,
			max: MAX_GALLERY_ITEMS,
		});
	});

	it("passes a gallery of MAX_GALLERY_ITEMS items", async () => {
		const view: View = { components: [{ type: "gallery", items: media(MAX_GALLERY_ITEMS) }] };

		expect(() => validateView(view, [])).not.toThrow();
	});

	it("refuses a gallery item description over MAX_MEDIA_DESCRIPTION", async () => {
		const view: View = {
			components: [{ type: "gallery", items: media(1, "d".repeat(MAX_MEDIA_DESCRIPTION + 1)) }],
		};

		expect(await limitOf(view)).toMatchObject({
			limit: "MAX_MEDIA_DESCRIPTION",
			actual: MAX_MEDIA_DESCRIPTION + 1,
		});
	});

	it("refuses a thumbnail description over MAX_MEDIA_DESCRIPTION", async () => {
		const view: View = {
			components: [
				{
					type: "section",
					texts: ["a"],
					accessory: {
						thumbnail: { url: "u", description: "d".repeat(MAX_MEDIA_DESCRIPTION + 1) },
					},
				},
			],
		};

		expect(await limitOf(view)).toMatchObject({ limit: "MAX_MEDIA_DESCRIPTION" });
	});

	it("passes a description of exactly MAX_MEDIA_DESCRIPTION", async () => {
		const view: View = {
			components: [{ type: "gallery", items: media(1, "d".repeat(MAX_MEDIA_DESCRIPTION)) }],
		};

		expect(() => validateView(view, [])).not.toThrow();
	});

	it.each([0, MAX_ROW_BUTTONS + 1])("refuses a V2 buttons row of %i buttons", async (count) => {
		const view: View<State> = { components: [{ type: "buttons", buttons: buttons(count) }] };

		expect(await limitOf(view)).toMatchObject({
			limit: "MAX_ROW_BUTTONS",
			actual: count,
			max: MAX_ROW_BUTTONS,
		});
	});

	it.each([0, MAX_ROW_BUTTONS + 1])("refuses a V1 buttons row of %i buttons", async (count) => {
		const view: View<State> = { rows: [{ type: "buttons", buttons: buttons(count) }] };

		expect(await limitOf(view)).toMatchObject({ limit: "MAX_ROW_BUTTONS" });
	});

	it("passes a row of MAX_ROW_BUTTONS buttons", async () => {
		const view: View<State> = { rows: [{ type: "buttons", buttons: buttons(MAX_ROW_BUTTONS) }] };

		expect(() => validateView(view, [])).not.toThrow();
	});

	it("refuses a V1 view with more than MAX_MESSAGE_ROWS rows, nulls skipped", async () => {
		const row = { type: "buttons", buttons: buttons(1) } as const;
		const atLimit: View<State> = {
			rows: [...Array.from({ length: MAX_MESSAGE_ROWS }, () => row), null],
		};
		const over: View<State> = { rows: Array.from({ length: MAX_MESSAGE_ROWS + 1 }, () => row) };

		expect(() => validateView(atLimit, [])).not.toThrow();
		expect(await limitOf(over)).toMatchObject({
			limit: "MAX_MESSAGE_ROWS",
			actual: MAX_MESSAGE_ROWS + 1,
			max: MAX_MESSAGE_ROWS,
		});
	});

	it("refuses a V1 view with more than MAX_MESSAGE_EMBEDS embeds", async () => {
		const atLimit: View = {
			embeds: Array.from({ length: MAX_MESSAGE_EMBEDS }, () => new EmbedBuilder()),
		};
		const over: View = {
			embeds: Array.from({ length: MAX_MESSAGE_EMBEDS + 1 }, () => new EmbedBuilder()),
		};

		expect(() => validateView(atLimit, [])).not.toThrow();
		expect(await limitOf(over)).toMatchObject({
			limit: "MAX_MESSAGE_EMBEDS",
			actual: MAX_MESSAGE_EMBEDS + 1,
			max: MAX_MESSAGE_EMBEDS,
		});
	});

	it("refuses a V2 view holding only nulls", async () => {
		const error = await captureError(async () => validateView({ components: [null, null] }, []));

		expect(error).toBeInstanceOf(EmptyViewError);
		expect(error).toMatchObject({ layout: "v2" });
	});

	it("refuses a V1 view holding nothing", async () => {
		const error = await captureError(async () => validateView({ rows: [null] }, []));

		expect(error).toBeInstanceOf(EmptyViewError);
		expect(error).toMatchObject({ layout: "v1" });
	});

	it("refuses a container holding only nulls", async () => {
		const view: View = {
			components: [
				{ type: "text", content: "a" },
				{ type: "container", children: [null] },
			],
		};

		expect(await captureError(async () => validateView(view, []))).toBeInstanceOf(EmptyViewError);
	});

	it("refuses a file missing from the view's files", async () => {
		const view: View = {
			components: [{ type: "container", children: [{ type: "file", name: "a.txt" }] }],
			files: [{ name: "b.txt", bytes: new Uint8Array() }],
		};

		const error = await captureError(async () => validateView(view, [attachment("a.txt")]));

		expect(error).toBeInstanceOf(MissingAttachmentError);
		expect(error).toMatchObject({ fileName: "a.txt" });
	});

	it("refuses a file missing from the message's attachments when files are left out", async () => {
		const view: View = { components: [{ type: "file", name: "a.txt" }] };

		expect(
			await captureError(async () => validateView(view, [attachment("b.txt")])),
		).toBeInstanceOf(MissingAttachmentError);
	});

	it("passes a file the message already carries when files are left out", async () => {
		const view: View = { components: [{ type: "file", name: "a.txt" }] };

		expect(() => validateView(view, [attachment("a.txt")])).not.toThrow();
	});

	it("passes a file the view's files carry", async () => {
		const view: View = {
			components: [{ type: "file", name: "a.txt" }],
			files: [{ name: "a.txt", bytes: new Uint8Array() }],
		};

		expect(() => validateView(view, [])).not.toThrow();
	});
});
