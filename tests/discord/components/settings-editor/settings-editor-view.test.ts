import { EmbedBuilder } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { fixedClock } from "@/clock";
import type { InteractiveMessagePayload } from "@/discord/components/interactive-message";
import { ROOT_LEVEL_KEY } from "@/discord/components/settings-editor/navigation";
import {
	createEditorButtons,
	createEditorView,
	editorComponentIds,
	MAX_SELECT_OPTIONS,
	type SettingsEditorEmbedsChrome,
	type SettingsEditorState,
} from "@/discord/components/settings-editor/settings-editor.view";
import type { SettingsEditorField } from "@/discord/components/settings-editor/settings-editor-fields";
import { EMBED_COLORS } from "@/discord/ui/colors";
import type { Locale, Translator } from "@/i18n";

const IDS = editorComponentIds("test");
const LOCALE: Locale = "en";
/** Fixed, so a stamped embed is asserted on rather than merely observed to exist. */
const RENDERED_AT = new Date("2026-02-03T10:00:00.000Z");
const BOT_AVATAR = "https://cdn.example.test/bot.png";
const DRESSING = { clock: fixedClock(RENDERED_AT), iconUrl: BOT_AVATAR };

/** Echoes the key, so an assertion names the string the screen asked for. */
const translator = { translate: (_locale: Locale, key: string) => key } as unknown as Translator;

type Field = "title" | "roles";

const FIELDS: readonly SettingsEditorField<Field>[] = [
	{
		key: "title",
		labelKey: "title.label",
		hintKey: "title.hint",
		kind: "text",
		style: "short",
		maxLength: 100,
	},
	{
		key: "roles",
		labelKey: "roles.label",
		hintKey: "roles.hint",
		kind: "level",
		levelKey: "roles",
	},
];

const LEVELS = [
	{ key: "roles", titleKey: "roles.title", fields: [] as SettingsEditorField<Field>[] },
];

const chrome: SettingsEditorEmbedsChrome<string, never> = {
	titleKey: "screen.title",
	introKey: "screen.intro",
	selectPlaceholderKey: "screen.placeholder",
	preview: () => new EmbedBuilder().setDescription("preview"),
	filesOf: () => [],
	hasOverrides: () => true,
};

function makeView(
	levels: typeof LEVELS | undefined = LEVELS,
	dressed: SettingsEditorEmbedsChrome<string, never> = chrome,
) {
	const noop = vi.fn(async () => {});
	const buttons = createEditorButtons<string, never>(IDS, translator, LOCALE, {
		onReset: noop,
		onConfirmReset: noop,
		onCancelReset: noop,
		onReturn: noop,
	});
	return createEditorView<string, never, Field>(
		IDS,
		FIELDS,
		levels,
		buttons,
		dressed,
		translator,
		LOCALE,
		DRESSING,
	);
}

function state(path: readonly string[]): SettingsEditorState<string, never> {
	return {
		subject: "s",
		assets: [],
		notice: null,
		confirming: null,
		path,
	};
}

/**
 * The settings editor always renders the "embeds" layout — it has no `Card` of
 * its own to switch to — so every assertion below narrows once here rather
 * than guarding the discriminant at each call site.
 */
function asEmbeds<S>(
	payload: InteractiveMessagePayload<S>,
): Extract<InteractiveMessagePayload<S>, { layout?: "embeds" }> {
	if (payload.layout === "card") {
		throw new Error("expected the settings editor to render its embeds layout");
	}
	return payload;
}

/**
 * Every rendered component as plain JSON. A link button carries no `custom_id`,
 * so the union discord.js returns is read as a record rather than narrowed six
 * ways for an assertion that only looks up two keys.
 */
function rendered(
	payload: ReturnType<ReturnType<typeof makeView>["render"]>,
): Record<string, unknown>[] {
	return asEmbeds(payload).components.flatMap((row) =>
		row.components.map((component) => component.toJSON() as unknown as Record<string, unknown>),
	);
}

/** Every custom id rendered in the payload's action rows. */
function renderedIds(payload: ReturnType<ReturnType<typeof makeView>["render"]>): unknown[] {
	return rendered(payload).map((component) => component.custom_id);
}

describe("the settings editor view", () => {
	describe("the reset control", () => {
		/**
		 * Absent, not disabled — the same principle as the return control: a
		 * greyed control asks the reader to work out why it is there at all.
		 */
		it("is not rendered when nothing is customised", () => {
			const noOverrides: SettingsEditorEmbedsChrome<string, never> = {
				...chrome,
				hasOverrides: () => false,
			};

			expect(
				renderedIds(makeView(LEVELS, noOverrides).render(state([ROOT_LEVEL_KEY]))),
			).not.toContain(IDS.reset);
		});

		it("is rendered once there is something to reset", () => {
			expect(renderedIds(makeView().render(state([ROOT_LEVEL_KEY])))).toContain(IDS.reset);
		});
	});

	describe("the return control", () => {
		/**
		 * FR-021. Absent, not disabled: a greyed control asks the reader to work out
		 * why it is there at all.
		 */
		it("is not rendered at the root", () => {
			expect(renderedIds(makeView().render(state([ROOT_LEVEL_KEY])))).not.toContain(IDS.back);
		});

		it("is rendered one level down", () => {
			expect(renderedIds(makeView().render(state([ROOT_LEVEL_KEY, "roles"])))).toContain(IDS.back);
		});

		/**
		 * A picker field opens a modal now, so the view never carries a "something
		 * else is showing over the menu" state of its own — whether the control
		 * shows is a question about `path` alone. `SettingsEditorState` no longer
		 * declares any other field the view could consult, so there is nothing left
		 * to construct a case around; this asserts the state shape itself instead.
		 */
		it("depends on nothing but the path", () => {
			const built = state([ROOT_LEVEL_KEY]);

			expect(Object.keys(built)).toEqual(["subject", "assets", "notice", "confirming", "path"]);
		});
	});

	describe("the heading", () => {
		/**
		 * The menu and the preview under it already say what the screen is for, so
		 * an intro repeating that on every render is a paragraph to read past on
		 * the way to one's own settings.
		 */
		it("is dropped at the root, leaving the preview alone on screen", () => {
			const payload = asEmbeds(makeView().render(state([ROOT_LEVEL_KEY])));

			expect(payload.embeds).toHaveLength(1);
			expect(payload.embeds[0]?.toJSON().description).toBe("preview");
		});

		/**
		 * Nothing was written, so the preview shows no trace of it: this is the one
		 * outcome the root has to say out loud.
		 */
		it("comes back at the root for a refusal, carrying nothing else", () => {
			const payload = asEmbeds(
				makeView().render({
					...state([ROOT_LEVEL_KEY]),
					notice: { text: "That prefix is taken.", tone: "refusal" },
				}),
			);

			expect(payload.embeds).toHaveLength(2);
			expect(payload.embeds[0]?.toJSON().description).toBe("That prefix is taken.");
		});

		/**
		 * The change it confirms is already on screen in the preview underneath, and
		 * an embed saying so would sit there — outliving what it reports — until the
		 * next action.
		 */
		it("stays away at the root for a confirmation", () => {
			const payload = asEmbeds(
				makeView().render({
					...state([ROOT_LEVEL_KEY]),
					notice: { text: "✅ saved", tone: "confirmation" },
				}),
			);

			expect(payload.embeds).toHaveLength(1);
			expect(payload.embeds[0]?.toJSON().description).toBe("preview");
		});

		/** A level down the embed is up anyway, so a confirmation rides along on it. */
		it("carries a confirmation below the root, where it costs no room of its own", () => {
			const payload = asEmbeds(
				makeView().render({
					...state([ROOT_LEVEL_KEY, "roles"]),
					notice: { text: "✅ saved", tone: "confirmation" },
				}),
			);

			expect(payload.embeds[0]?.toJSON().description).toContain("✅ saved");
		});

		/** FR-020: "Roles" alone would not say which screen it belongs to. */
		it("trails the levels entered, not just the current one", () => {
			const embed = asEmbeds(
				makeView().render(state([ROOT_LEVEL_KEY, "roles"])),
			).embeds[0]?.toJSON();
			expect(embed?.title).toBe("screen.title › roles.title");
			expect(embed?.description).toBe("screen.intro");
		});

		/** The club's colour, the screen it belongs to, the bot, and the time. */
		it("signs its own embed without touching a published preview", () => {
			const [header, preview] = asEmbeds(
				makeView().render(state([ROOT_LEVEL_KEY, "roles"])),
			).embeds.map((embed) => embed.toJSON());

			expect(header?.color).toBe(EMBED_COLORS.brand);
			expect(header?.footer).toEqual({ text: "screen.title", icon_url: BOT_AVATAR });
			expect(header?.timestamp).toBe(RENDERED_AT.toISOString());
			expect(preview?.footer).toBeUndefined();
			expect(preview?.timestamp).toBeUndefined();
		});

		/** A footer the administrator is editing must not be overwritten by one of ours. */
		it("leaves a footer the preview set itself alone", () => {
			const published: SettingsEditorEmbedsChrome<string, never> = {
				...chrome,
				preview: () => new EmbedBuilder().setFooter({ text: "what members read" }),
			};
			const preview = asEmbeds(
				makeView(LEVELS, published).render(state([ROOT_LEVEL_KEY])),
			).embeds[0]?.toJSON();

			expect(preview?.footer).toEqual({ text: "what members read" });
		});
	});

	describe("the menu", () => {
		it("offers the current level's fields, with a description under every entry", () => {
			const payload = makeView().render(state([ROOT_LEVEL_KEY]));
			const menu = rendered(payload).find((component) => component.custom_id === IDS.field);
			expect(menu?.options).toEqual([
				{ label: "title.label", value: "title", description: "title.hint" },
				{ label: "roles.label", value: "roles", description: "roles.hint" },
			]);
		});
	});

	describe("a screen that declared no level", () => {
		it("never renders a return control", () => {
			expect(renderedIds(makeView(undefined).render(state([ROOT_LEVEL_KEY])))).not.toContain(
				IDS.back,
			);
		});
	});
});

describe("the select menu's capacity", () => {
	function levelOf(count: number) {
		return Array.from({ length: count }, (_, index) => ({
			key: `f${index}` as const,
			labelKey: "l",
			hintKey: "h",
			kind: "text" as const,
			style: "short" as const,
			maxLength: 10,
		}));
	}

	function build(fields: ReturnType<typeof levelOf>) {
		const noop = vi.fn(async () => {});
		const buttons = createEditorButtons<string, never>(IDS, translator, LOCALE, {
			onReset: noop,
			onConfirmReset: noop,
			onCancelReset: noop,
			onReturn: noop,
		});
		return () =>
			createEditorView(IDS, fields, undefined, buttons, chrome, translator, LOCALE, DRESSING);
	}

	it("accepts a level filled to the brim", () => {
		expect(build(levelOf(MAX_SELECT_OPTIONS))).not.toThrow();
	});

	/**
	 * Discord rejects the whole message rather than showing the first 25, so a
	 * declaration that overflows must fail where the level can still be named —
	 * not at render time, which would only report an invalid message.
	 */
	it("refuses one entry too many, naming the level", () => {
		expect(build(levelOf(MAX_SELECT_OPTIONS + 1))).toThrow(/root.*26.*25/s);
	});
});

describe("a group's modal capacity", () => {
	function memberOf(index: number) {
		return {
			key: `m${index}` as const,
			labelKey: "l",
			hintKey: "h",
			kind: "text" as const,
			style: "short" as const,
			maxLength: 10,
		};
	}

	function groupOf(count: number) {
		return {
			key: "g",
			labelKey: "group.label",
			hintKey: "group.hint",
			kind: "group" as const,
			fields: Array.from({ length: count }, (_, index) => memberOf(index)),
		};
	}

	function build(memberCount: number, hasGroupLegend = false) {
		const noop = vi.fn(async () => {});
		const buttons = createEditorButtons<string, never>(IDS, translator, LOCALE, {
			onReset: noop,
			onConfirmReset: noop,
			onCancelReset: noop,
			onReturn: noop,
		});
		return () =>
			createEditorView(
				IDS,
				[groupOf(memberCount)],
				undefined,
				buttons,
				chrome,
				translator,
				LOCALE,
				DRESSING,
				hasGroupLegend,
			);
	}

	it("accepts a group filled to the modal's own five-component cap", () => {
		expect(build(5)).not.toThrow();
	});

	/**
	 * Discord's modal object carries "between 1 and 5 (inclusive) components" —
	 * so a group whose members alone already spend all five leaves the screen
	 * unable to add anything else to that modal later, and a sixth member
	 * overflows it outright. Failing here names the group, not merely an
	 * invalid message once an administrator opens it.
	 */
	it("refuses one member too many, naming the group", () => {
		expect(build(6)).toThrow(/"g".*6.*5/s);
	});

	/**
	 * `groupLegend` is one hook for the whole screen, not declared per group, so
	 * every group reserves the slot a legend would cost rather than pass here
	 * only to overflow the day a legend is actually attached to it.
	 */
	it("reserves one slot for the screen's legend when the screen declares one", () => {
		expect(build(5, true)).toThrow(/"g".*reserves.*legend/s);
		expect(build(4, true)).not.toThrow();
	});
});
