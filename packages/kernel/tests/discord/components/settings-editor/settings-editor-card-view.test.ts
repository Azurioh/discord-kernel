import type {
	ActionRowBuilder,
	ContainerBuilder,
	MessageActionRowComponentBuilder,
} from "discord.js";
import { ComponentType } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { fixedClock } from "@/clock";
import type { InteractiveMessagePayload } from "@/discord/components/interactive-message/interactive-message-collector";
import type { SettingsEditorLevel } from "@/discord/components/settings-editor/navigation";
import { ROOT_LEVEL_KEY } from "@/discord/components/settings-editor/navigation";
import {
	createEditorButtons,
	editorComponentIds,
	type SettingsEditorButtons,
	type SettingsEditorCardChrome,
	type SettingsEditorState,
} from "@/discord/components/settings-editor/settings-editor.view";
import {
	createCardEditorView,
	MAX_CARD_BUTTON_LEVEL_ENTRIES,
} from "@/discord/components/settings-editor/settings-editor-card.view";
import type { SettingsEditorField } from "@/discord/components/settings-editor/settings-editor-fields";
import { type Button, createButton } from "@/discord/interaction/button";
import type { Locale } from "@/i18n/locale";
import type { Translator } from "@/i18n/translator";

const IDS = editorComponentIds("test");
const LOCALE: Locale = "en";
const RENDERED_AT = new Date("2026-02-03T10:00:00.000Z");
const BOT_AVATAR = "https://cdn.example.test/bot.png";
const DRESSING = { clock: fixedClock(RENDERED_AT), iconUrl: BOT_AVATAR };

/** Echoes the key, so an assertion names the string the screen asked for. */
const translator = { translate: (_locale: Locale, key: string) => key } as unknown as Translator;

type Field = "title" | "declare" | "current";

const ROOT_FIELDS: readonly SettingsEditorField<Field>[] = [
	{
		key: "title",
		labelKey: "title.label",
		hintKey: "title.hint",
		kind: "text",
		style: "short",
		maxLength: 100,
	},
];

/** Two entries a `"buttons"` level offers — what the tournament games level mirrors. */
function buttonLevelFields(count = 2): readonly SettingsEditorField<Field>[] {
	return Array.from({ length: count }, (_, index) => ({
		key: `f${index}` as Field,
		labelKey: `f${index}.label`,
		hintKey: `f${index}.hint`,
		kind: "text" as const,
		style: "short" as const,
		maxLength: 10,
	}));
}

function state(
	path: readonly string[],
	overrides: Partial<SettingsEditorState<string, never>> = {},
): SettingsEditorState<string, never> {
	return {
		subject: "s",
		assets: [],
		notice: null,
		confirming: null,
		path,
		...overrides,
	};
}

interface BlockJson {
	readonly type: ComponentType;
	readonly content?: string;
	readonly custom_id?: string;
	readonly disabled?: boolean;
	readonly accessory?: BlockJson;
	readonly components?: BlockJson[];
}

function containerBlocks(container: { toJSON(): { components: BlockJson[] } }): BlockJson[] {
	return container.toJSON().components;
}

/**
 * `createCardEditorView` always renders the "card" layout — it has no embeds
 * branch to switch to — so every assertion below narrows once here rather
 * than guarding the discriminant at each call site.
 */
function asCard<S>(
	payload: InteractiveMessagePayload<S>,
): Extract<InteractiveMessagePayload<S>, { layout: "card" }> {
	if (payload.layout !== "card") {
		throw new Error("expected the card editor view to render its card layout");
	}
	return payload;
}

/** The custom ids of every button in one rendered `ActionRow`. */
function idsOf(row: ActionRowBuilder<MessageActionRowComponentBuilder>): (string | undefined)[] {
	return (row.toJSON().components as { custom_id?: string }[]).map((c) => c.custom_id);
}

/**
 * `hasOverrides` left `undefined` (never passed at all, not a function) is
 * what a screen declaring no `hasOverrides` looks like once compiled — the
 * property is optional, so a screen with nothing a reset could put back
 * simply never states it.
 */
function makeButtons(hasOverrides: boolean | undefined): {
	buttons: SettingsEditorButtons<string, never>;
	chrome: SettingsEditorCardChrome<string, never>;
} {
	const noop = vi.fn(async () => {});
	const buttons = createEditorButtons<string, never>(IDS, translator, LOCALE, {
		onReset: noop,
		onConfirmReset: noop,
		onCancelReset: noop,
		onReturn: noop,
	});
	const chrome: SettingsEditorCardChrome<string, never> = {
		layout: "card",
		titleKey: "screen.title",
		...(hasOverrides === undefined ? {} : { hasOverrides: () => hasOverrides }),
		preview: () => [{ kind: "text", content: "preview" }],
		filesOf: () => [],
	};
	return { buttons, chrome };
}

function makeView(
	levels: readonly SettingsEditorLevel<Field>[] | undefined,
	fieldButtons: ReadonlyMap<string, Button<SettingsEditorState<string, never>>>,
	hasOverrides: boolean | undefined,
) {
	const { buttons, chrome } = makeButtons(hasOverrides);
	return createCardEditorView<string, never, Field>(
		ROOT_FIELDS,
		levels,
		buttons,
		fieldButtons,
		chrome,
		translator,
		LOCALE,
		DRESSING,
	);
}

function fieldButtonsFor(
	fields: readonly SettingsEditorField<Field>[],
): Map<string, Button<SettingsEditorState<string, never>>> {
	return new Map(
		fields.map((field) => [
			field.key,
			createButton<SettingsEditorState<string, never>>({
				id: `btn:${field.key}`,
				label: field.key,
			}),
		]),
	);
}

describe("createCardEditorView", () => {
	describe("the reset control", () => {
		/**
		 * With no "done" control any more, a flat screen offering no reset has
		 * nothing left to put in the outer row at all — it is left out entirely
		 * rather than sent as an empty one, which Discord would refuse.
		 */
		it("leaves the outer row empty when nothing is customised", () => {
			const view = makeView(undefined, new Map(), false);
			const payload = asCard(view.render(state([ROOT_LEVEL_KEY])));

			expect(payload.controls ?? []).toEqual([]);
		});

		it("is present in the outer row once there is something to reset", () => {
			const view = makeView(undefined, new Map(), true);
			const payload = asCard(view.render(state([ROOT_LEVEL_KEY])));

			const controlIds = (payload.controls ?? []).flatMap((row) => idsOf(row));
			expect(controlIds).toEqual([IDS.reset]);
		});

		/**
		 * A screen with nothing a reset could ever put back declares no
		 * `hasOverrides` at all, rather than one that always answers `false` —
		 * its absence alone is what tells the editor to offer no reset, whatever
		 * the subject looks like.
		 */
		it("leaves the outer row empty when the chrome declares no hasOverrides at all", () => {
			const view = makeView(undefined, new Map(), undefined);
			const payload = asCard(view.render(state([ROOT_LEVEL_KEY])));

			expect(payload.controls ?? []).toEqual([]);
		});
	});

	describe("the screen's own controls", () => {
		it("render outside the container, not as one of its blocks", () => {
			const view = makeView(undefined, new Map(), true);
			const payload = asCard(view.render(state([ROOT_LEVEL_KEY])));

			// Not part of the card at all: the container's own blocks end with its
			// preview and signature, no button row among them.
			const blocks = containerBlocks(payload.card.apply(state([ROOT_LEVEL_KEY])));
			expect(blocks.some((block) => block.type === ComponentType.ActionRow)).toBe(false);

			// They are their own top-level row instead.
			expect(payload.controls).toHaveLength(1);
			expect(payload.controls?.[0] && idsOf(payload.controls[0])).toEqual([IDS.reset]);
		});

		it("stays as a sibling row when the screen is one level below the root", () => {
			const levels: SettingsEditorLevel<Field>[] = [
				{ key: "deep", titleKey: "deep.title", fields: [] },
			];
			const view = makeView(levels, new Map(), true);
			const payload = asCard(view.render(state([ROOT_LEVEL_KEY, "deep"])));

			expect(payload.controls?.[0] && idsOf(payload.controls[0])).toEqual([IDS.reset, IDS.back]);
		});
	});

	describe("neutralising the screen", () => {
		it("disables every control on the card and on the outer row alike", () => {
			const view = makeView(undefined, new Map(), true);
			// The card layout's `disabledControls` always hands back its container
			// and outer row together in one `components` list — see its own doc on
			// `DisabledInteractiveMessageComponents`.
			const disabled = view.disabledControls(state([ROOT_LEVEL_KEY])) as {
				readonly components: readonly (
					| ContainerBuilder
					| ActionRowBuilder<MessageActionRowComponentBuilder>
				)[];
			};

			const [container, ...rows] = disabled.components;
			expect(container).toBeDefined();
			expect(rows).toHaveLength(1);
			const outerRow = rows[0] as ActionRowBuilder<MessageActionRowComponentBuilder>;
			for (const control of outerRow.toJSON().components as { disabled?: boolean }[]) {
				expect(control.disabled).toBe(true);
			}
		});
	});

	describe('a level declaring entryLayout "buttons"', () => {
		const fields = buttonLevelFields(2);
		const levels: SettingsEditorLevel<Field>[] = [
			{ key: "flat", titleKey: "flat.title", fields, entryLayout: "buttons" },
		];

		it("renders its entries as one row, not as sections", () => {
			const view = makeView(levels, fieldButtonsFor(fields), false);
			const payload = asCard(view.render(state([ROOT_LEVEL_KEY, "flat"])));
			const blocks = containerBlocks(payload.card.apply(state([ROOT_LEVEL_KEY, "flat"])));

			expect(blocks.some((block) => block.type === ComponentType.Section)).toBe(false);
			const row = blocks.find((block) => block.type === ComponentType.ActionRow);
			expect(row?.components?.map((c) => c.custom_id)).toEqual(
				fields.map((field) => `btn:${field.key}`),
			);
		});

		/**
		 * Discord refuses an `ActionRow` carrying more than five buttons, so a
		 * level offering more entries than that folds them into as many rows of
		 * five as it needs, in declaration order — this is what lets a level like
		 * `/ticket type manage`'s root, with seven entries, exist at all.
		 */
		it("splits more than five entries across as many rows of five as it needs", () => {
			const manyFields = buttonLevelFields(7);
			const manyLevels: SettingsEditorLevel<Field>[] = [
				{ key: "flat", titleKey: "flat.title", fields: manyFields, entryLayout: "buttons" },
			];
			const view = makeView(manyLevels, fieldButtonsFor(manyFields), false);
			const payload = asCard(view.render(state([ROOT_LEVEL_KEY, "flat"])));
			const blocks = containerBlocks(payload.card.apply(state([ROOT_LEVEL_KEY, "flat"])));

			const rows = blocks.filter((block) => block.type === ComponentType.ActionRow);
			expect(rows).toHaveLength(2);
			expect(rows[0]?.components).toHaveLength(5);
			expect(rows[1]?.components).toHaveLength(2);
			expect(rows.flatMap((row) => row.components?.map((c) => c.custom_id) ?? [])).toEqual(
				manyFields.map((field) => `btn:${field.key}`),
			);
		});
	});

	describe("the chrome's own entryLayout", () => {
		/**
		 * The root is never itself a `SettingsEditorLevel` — its fields come
		 * straight from `createCardEditorView`'s own `fields` parameter — so its
		 * `entryLayout` is the chrome's, mirroring what a declared level states.
		 */
		it("renders the root's entries as buttons when the chrome declares it", () => {
			const fields = buttonLevelFields(2);
			// `makeView` always builds its root from the module-level `ROOT_FIELDS`,
			// so this exercises `createCardEditorView` directly, with the fields
			// under test as the root's own instead.
			const { buttons, chrome } = makeButtons(false);
			const view = createCardEditorView<string, never, Field>(
				fields,
				undefined,
				buttons,
				fieldButtonsFor(fields),
				{ ...chrome, entryLayout: "buttons" },
				translator,
				LOCALE,
				DRESSING,
			);

			const payload = asCard(view.render(state([ROOT_LEVEL_KEY])));
			const blocks = containerBlocks(payload.card.apply(state([ROOT_LEVEL_KEY])));

			expect(blocks.some((block) => block.type === ComponentType.Section)).toBe(false);
			const row = blocks.find((block) => block.type === ComponentType.ActionRow);
			expect(row?.components?.map((c) => c.custom_id)).toEqual(
				fields.map((field) => `btn:${field.key}`),
			);
		});
	});

	describe("a level with no entryLayout declared", () => {
		const fields = buttonLevelFields(2);
		const levels: SettingsEditorLevel<Field>[] = [{ key: "flat", titleKey: "flat.title", fields }];

		it("still renders its entries as sections", () => {
			const view = makeView(levels, fieldButtonsFor(fields), false);
			const payload = asCard(view.render(state([ROOT_LEVEL_KEY, "flat"])));
			const blocks = containerBlocks(payload.card.apply(state([ROOT_LEVEL_KEY, "flat"])));

			const sections = blocks.filter((block) => block.type === ComponentType.Section);
			expect(sections).toHaveLength(fields.length);
			expect(blocks.some((block) => block.type === ComponentType.ActionRow)).toBe(false);
		});
	});

	describe('a "buttons" level\'s own capacity', () => {
		it("accepts a level filled to its own cap", () => {
			const fields = buttonLevelFields(MAX_CARD_BUTTON_LEVEL_ENTRIES);
			const levels: SettingsEditorLevel<Field>[] = [
				{ key: "flat", titleKey: "flat.title", fields, entryLayout: "buttons" },
			];
			expect(() => makeView(levels, fieldButtonsFor(fields), false)).not.toThrow();
		});

		/**
		 * Sits well above what a `"sections"` level could ever declare — a
		 * `"buttons"` row costs its `ActionRow` plus the buttons in it, cheaper
		 * per entry than a `Section`'s three components — so failing here names
		 * the level rather than the invalid message Discord would otherwise
		 * reject, at a cap that reflects what a container can actually carry
		 * rather than Discord's five-button row (which the rows themselves never
		 * exceed — see "splits more than five entries" above).
		 */
		it("refuses one entry too many, naming the level", () => {
			const fields = buttonLevelFields(MAX_CARD_BUTTON_LEVEL_ENTRIES + 1);
			const levels: SettingsEditorLevel<Field>[] = [
				{ key: "flat", titleKey: "flat.title", fields, entryLayout: "buttons" },
			];
			const over = MAX_CARD_BUTTON_LEVEL_ENTRIES + 1;
			expect(() => makeView(levels, fieldButtonsFor(fields), false)).toThrow(
				new RegExp(`"flat".*${over}.*${MAX_CARD_BUTTON_LEVEL_ENTRIES}`, "s"),
			);
		});

		/**
		 * `entryActions` is state-dependent — the confirm/cancel pair it swaps to
		 * exists only once a state renders it — so the construction-time guard has
		 * nothing to count from an actual render. It reserves that pair's own
		 * worst case instead, whenever the chrome declares the hook at all, and so
		 * refuses a level this many entries earlier than it would without it.
		 */
		it("reserves entryActions's own worst case, refusing sooner than without it", () => {
			const fields = buttonLevelFields(MAX_CARD_BUTTON_LEVEL_ENTRIES - 1);
			const levels: SettingsEditorLevel<Field>[] = [
				{ key: "flat", titleKey: "flat.title", fields, entryLayout: "buttons" },
			];
			const { buttons, chrome } = makeButtons(false);

			// Fits on its own — one below the cap.
			expect(() =>
				createCardEditorView<string, never, Field>(
					ROOT_FIELDS,
					levels,
					buttons,
					fieldButtonsFor(fields),
					chrome,
					translator,
					LOCALE,
					DRESSING,
				),
			).not.toThrow();

			// The same level, only now the chrome declares `entryActions` — it no
			// longer fits once its worst case is reserved.
			expect(() =>
				createCardEditorView<string, never, Field>(
					ROOT_FIELDS,
					levels,
					buttons,
					fieldButtonsFor(fields),
					{ ...chrome, entryActions: () => [] },
					translator,
					LOCALE,
					DRESSING,
				),
			).toThrow(/"flat"/);
		});
	});

	describe("SettingsEditorCardChrome.entryActions", () => {
		const fields = buttonLevelFields(2);
		const levels: SettingsEditorLevel<Field>[] = [
			{ key: "flat", titleKey: "flat.title", fields, entryLayout: "buttons" },
		];

		function makeViewWithEntryActions(
			entryActions: NonNullable<SettingsEditorCardChrome<string, never>["entryActions"]>,
		) {
			const { buttons, chrome } = makeButtons(false);
			return createCardEditorView<string, never, Field>(
				ROOT_FIELDS,
				levels,
				buttons,
				fieldButtonsFor(fields),
				{ ...chrome, entryActions },
				translator,
				LOCALE,
				DRESSING,
			);
		}

		/** Every entry field's own button, in declaration order, then whatever the chrome adds. */
		it("adds its own buttons to the end of the level's entries row", () => {
			const extra = createButton<SettingsEditorState<string, never>>({ id: "extra", label: "x" });
			const view = makeViewWithEntryActions(() => [extra]);
			const shown = state([ROOT_LEVEL_KEY, "flat"]);
			const payload = asCard(view.render(shown));
			const blocks = containerBlocks(payload.card.apply(shown));

			const row = blocks.find((block) => block.type === ComponentType.ActionRow);
			expect(row?.components?.map((c) => c.custom_id)).toEqual([
				...fields.map((field) => `btn:${field.key}`),
				"extra",
			]);
		});

		/**
		 * A screen's own action waiting on its second click takes the row over
		 * entirely — the level's own field buttons (`gameAdd`/`game`, in the
		 * tournament screen this mirrors) step aside rather than sharing the row
		 * with whatever `entryActions` answers with while armed.
		 */
		it("replaces the row entirely with its own output while a confirmation is pending", () => {
			const confirm = createButton<SettingsEditorState<string, never>>({
				id: "confirm",
				label: "Confirm",
			});
			const cancel = createButton<SettingsEditorState<string, never>>({
				id: "cancel",
				label: "Cancel",
			});
			const view = makeViewWithEntryActions((s) =>
				s.confirming === "remove" ? [confirm, cancel] : [],
			);
			const shown = state([ROOT_LEVEL_KEY, "flat"], { confirming: "remove" });
			const payload = asCard(view.render(shown));
			const blocks = containerBlocks(payload.card.apply(shown));

			const row = blocks.find((block) => block.type === ComponentType.ActionRow);
			expect(row?.components?.map((c) => c.custom_id)).toEqual(["confirm", "cancel"]);
		});
	});
});
