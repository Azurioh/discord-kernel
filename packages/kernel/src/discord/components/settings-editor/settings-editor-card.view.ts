import type { InteractiveView } from "@/discord/components/interactive-message/interactive-message-collector";
import {
	canReturn,
	currentLevelKey,
	indexLevels,
	levelTrail,
	ROOT_LEVEL_KEY,
	type SettingsEditorLevel,
} from "@/discord/components/settings-editor/navigation";
import {
	resetButtons,
	SETTINGS_EDITOR_RESET_CONFIRMING,
	type SettingsEditorButtons,
	type SettingsEditorCardChrome,
	type SettingsEditorDressing,
	type SettingsEditorIds,
	type SettingsEditorRow,
	type SettingsEditorState,
} from "@/discord/components/settings-editor/settings-editor.view";
import type { SettingsEditorField } from "@/discord/components/settings-editor/settings-editor-fields";
import { SETTINGS_EDITOR_MESSAGES } from "@/discord/i18n";
import { type Button, createActionRow } from "@/discord/interaction/button";
import { type CardBlock, type CardDef, createCard } from "@/discord/ui/card";
import { EMBED_COLORS } from "@/discord/ui/colors";
import type { Locale } from "@/i18n/locale";
import type { Translator } from "@/i18n/translator";

/**
 * Discord refuses a card carrying more than {@link import("@/discord/ui/card").MAX_CARD_COMPONENTS}
 * components; every menu entry a level declares becomes a `Section` — its
 * text plus a button accessory, three components — so this is what a level's
 * own field list may not exceed *before* the chrome fixed around it
 * (breadcrumb, preview, extra blocks, separators, the bottom controls, the
 * signature) is even counted. Generous rather than exact: the fixed chrome
 * costs roughly a dozen components on its own, and no level this repository
 * declares comes within three of this cap.
 */
export const MAX_CARD_LEVEL_ENTRIES = 10;

/**
 * Discord refuses an `ActionRow` carrying more than five buttons, so a level
 * declaring `entryLayout: "buttons"` folds its entries into as many rows of
 * this size as it needs, rather than the single row it used to require.
 */
const BUTTONS_PER_ROW = 5;

/**
 * How many entries a level declaring `entryLayout: "buttons"` may carry
 * before the rows they compile to — one `ActionRow` per five, however many
 * that takes — would overrun what a container can actually hold.
 *
 * Sits higher than {@link MAX_CARD_LEVEL_ENTRIES} on purpose: a `"buttons"`
 * row costs its `ActionRow` plus the buttons in it, cheaper per entry than a
 * `"sections"` level's `Section` (text, accessory, the `Section` itself —
 * three components apiece). Generous rather than exact, for the same reason
 * {@link MAX_CARD_LEVEL_ENTRIES} is: the fixed chrome (breadcrumb, preview,
 * separators, the bottom controls, the signature) costs roughly a dozen
 * components on its own, and no level this repository declares comes within
 * half of this cap.
 */
export const MAX_CARD_BUTTON_LEVEL_ENTRIES = 20;

/**
 * The most buttons {@link SettingsEditorCardChrome.entryActions} ever adds to
 * one render of a level's own row: the confirm/cancel pair a screen's own
 * removal swaps to once armed — the single ask button it swaps *from* costs
 * less. Reserved against every `"buttons"` level's own cap whenever the
 * chrome declares the hook at all: the guard below runs once at construction,
 * before any state — and so before `entryActions` has anything to measure —
 * exists.
 */
const ENTRY_ACTIONS_RESERVE = 2;

/**
 * The button a menu entry's own `Section` carries, derived from the field's
 * key rather than declared alongside it — the same relationship `ids.field`
 * already has to the select it used to name, one level of indirection lower.
 */
export function fieldButtonId(ids: SettingsEditorIds, key: string): string {
	return `${ids.field}:${key}`;
}

/**
 * The card editor screen: one Components V2 card carrying the breadcrumb, the
 * last notice, whatever the screen adds above the preview, the preview
 * itself, a `Section` per entry of the current level — each with the button
 * `fieldButtonId` names — and the bottom controls, closing with the bot's own
 * signature.
 *
 * The counterpart of `createEditorView` for a screen declaring
 * `chrome.layout === "card"`; the two never mix; {@link mountSettingsEditor}
 * picks whichever this screen's chrome names.
 *
 * Takes no `SettingsEditorIds` of its own, unlike `createEditorView`: every
 * button it renders — reset, back, and one per menu entry — already exists,
 * built by `mountSettingsEditor` against those very ids, so nothing here has
 * to name them again.
 */
export function createCardEditorView<S, A, F extends string>(
	fields: readonly SettingsEditorField<F>[],
	levels: readonly SettingsEditorLevel<F>[] | undefined,
	buttons: SettingsEditorButtons<S, A>,
	fieldButtons: ReadonlyMap<string, Button<SettingsEditorState<S, A>>>,
	chrome: SettingsEditorCardChrome<S, A>,
	translator: Translator,
	locale: Locale,
	dressing: SettingsEditorDressing,
): InteractiveView<SettingsEditorState<S, A>> {
	const screenTitle = translator.translate(locale, chrome.titleKey);

	// The root's own `entryLayout` is the chrome's, mirroring
	// `SettingsEditorLevel.entryLayout` for the one level that is never itself a
	// `SettingsEditorLevel`.
	const allLevels = indexLevels(
		{ key: ROOT_LEVEL_KEY, titleKey: chrome.titleKey, fields, entryLayout: chrome.entryLayout },
		levels,
	);

	// A level's fields are authored, not accumulated: passing more entries than a
	// card can carry is a mistake in the declaration, and Discord would reject
	// the whole message rather than show the first ones that fit. Failing here
	// names the level; failing at render time would only say the message was
	// invalid.
	for (const level of allLevels.all) {
		// A `"buttons"` level spends its budget on rows of `ActionRow`s rather
		// than `Section`s, so it is checked against its own, higher cap instead
		// of the `"sections"` one — failing here names the level rather than the
		// invalid message Discord would otherwise reject. The chrome's own
		// `entryActions`, when declared, reserves its worst case on top of the
		// level's declared fields: those buttons exist only once a state renders
		// them, which this construction-time guard has none of to count instead.
		if (level.entryLayout === "buttons") {
			const reserve = chrome.entryActions === undefined ? 0 : ENTRY_ACTIONS_RESERVE;
			if (level.fields.length + reserve > MAX_CARD_BUTTON_LEVEL_ENTRIES) {
				throw new Error(
					`Settings editor level "${level.key}" declares ${level.fields.length} entries${
						reserve === 0 ? "" : ` (+${reserve} reserved for the chrome's own entryActions)`
					} with entryLayout "buttons"; a card holds ${MAX_CARD_BUTTON_LEVEL_ENTRIES} before its own controls. Split it into a deeper level.`,
				);
			}
		} else if (level.fields.length > MAX_CARD_LEVEL_ENTRIES) {
			throw new Error(
				`Settings editor level "${level.key}" declares ${level.fields.length} entries; a card section holds ${MAX_CARD_LEVEL_ENTRIES} before its own controls. Split it into a deeper level.`,
			);
		}
	}

	function heading(state: SettingsEditorState<S, A>): string {
		return levelTrail(state.path, allLevels, (level) =>
			translator.translate(locale, level.titleKey),
		);
	}

	/**
	 * The bot's own signature, once at the bottom of the card rather than on
	 * every embed the way two embeds each carried their own footer. Discord's
	 * own timestamp markdown, so it reads in the viewer's own locale exactly as
	 * an embed's timestamp already did.
	 */
	function signature(): string {
		const unixSeconds = Math.floor(dressing.clock.now().getTime() / 1000);
		return `-# ${screenTitle} • <t:${unixSeconds}:t>`;
	}

	/**
	 * One menu entry, as the `Section` that replaces it: its label as the title,
	 * its hint as the line under it, and the button `mountSettingsEditor`
	 * registered for it as the accessory — the very button that opens its modal
	 * or descends into it, reached by a click instead of a pick.
	 */
	function entrySection(field: SettingsEditorField<F>): CardBlock<SettingsEditorState<S, A>> {
		const title = translator.translate(locale, field.labelKey);
		const lines = [translator.translate(locale, field.hintKey)];
		const action = fieldButtons.get(field.key);
		return action === undefined
			? { kind: "entry", title, lines }
			: { kind: "entry", title, lines, action };
	}

	/**
	 * A `"buttons"` level's entries, as the rows that replace their `Section`s:
	 * each field's own button — labelled with the entry's own name, not the
	 * generic "Open"/"Edit" a `"sections"` level wears, which is the whole
	 * point of folding them into rows of buttons instead of stacking them.
	 * `mountSettingsEditor` is what actually words the button that way — see
	 * its own `buildFieldButton` — this only collects the ones this level owns.
	 */
	function entryButtons(level: SettingsEditorLevel<F>): Button<SettingsEditorState<S, A>>[] {
		return level.fields.map((field) => {
			const button = fieldButtons.get(field.key);
			if (button === undefined) {
				// `fieldButtons` is built by `mountSettingsEditor` over every field of
				// every level up front, this level's included — unreachable outside a
				// wiring mistake in that map, not something an administrator can cause.
				throw new Error(
					`Settings editor level "${level.key}" has no button registered for field "${field.key}".`,
				);
			}
			return button;
		});
	}

	/**
	 * A `"buttons"` level's entries row for one render: its own field buttons,
	 * plus whatever {@link SettingsEditorCardChrome.entryActions} adds — the
	 * create/edit/remove row a module's own removal control now lives in,
	 * rather than floating beside a picker or hiding at the bottom of the card.
	 *
	 * A screen's own action waiting on its second click takes the row over
	 * entirely: while `state.confirming` names anything, the level's own
	 * buttons step aside and the row is exactly what `entryActions` returns —
	 * the confirm/cancel pair, once it recognises its own key in `confirming`.
	 * The same "the pending question replaces what is here" rule the editor's
	 * own reset already follows for the row below the card, transposed to a
	 * level's own entries instead of the screen's outer one.
	 */
	function levelButtons(
		level: SettingsEditorLevel<F>,
		state: SettingsEditorState<S, A>,
	): readonly Button<SettingsEditorState<S, A>>[] {
		const actions = chrome.entryActions?.(state) ?? [];
		return state.confirming === null ? [...entryButtons(level), ...actions] : actions;
	}

	/**
	 * Split a `"buttons"` level's entries into as many rows of
	 * {@link BUTTONS_PER_ROW} as they need — Discord's own cap on one
	 * `ActionRow`, not a limit on how many entries the level may declare in
	 * total (that is {@link MAX_CARD_BUTTON_LEVEL_ENTRIES}, checked above).
	 */
	function buttonRows(
		buttons: readonly Button<SettingsEditorState<S, A>>[],
	): CardBlock<SettingsEditorState<S, A>>[] {
		const rows: CardBlock<SettingsEditorState<S, A>>[] = [];
		for (let start = 0; start < buttons.length; start += BUTTONS_PER_ROW) {
			rows.push({ kind: "controls", buttons: buttons.slice(start, start + BUTTONS_PER_ROW) });
		}
		return rows;
	}

	/**
	 * The screen's own controls for the current state, outside the card
	 * entirely — see the module-level note on {@link SettingsEditorRow}. Empty
	 * for a screen with nothing to offer here at all — a flat screen with
	 * nothing to reset, with dismissing the message the only way out.
	 */
	function outerButtons(state: SettingsEditorState<S, A>): Button<SettingsEditorState<S, A>>[] {
		if (state.confirming === SETTINGS_EDITOR_RESET_CONFIRMING) {
			return buttons.confirming;
		}
		// Reset, then the return control — the order the outer row reads left to
		// right. Each is absent rather than disabled wherever there is nothing for
		// it to do, same principle both already followed on their own.
		return [
			...resetButtons(buttons, chrome, state),
			...(canReturn(state.path) ? buttons.returning : []),
		];
	}

	/** {@link outerButtons}, compiled into the one row it renders as — or none at all. */
	function outerRow(state: SettingsEditorState<S, A>, forceDisabled: boolean): SettingsEditorRow[] {
		const row = outerButtons(state);
		return row.length === 0 ? [] : [createActionRow(row, state, { disableAll: forceDisabled })];
	}

	/**
	 * The card's blocks, top to bottom — but for the screen's own controls,
	 * which render beside the card rather than inside it — see {@link outerRow}.
	 * `disabled` here means only "the editor's own reset is waiting for its
	 * second click", not the outer neutralising pass: that one is `Card.apply`'s
	 * own `forceDisabled`, applied uniformly across every block a second time —
	 * see {@link import("@/discord/ui/card").Card}.
	 */
	function openBlocks(
		state: SettingsEditorState<S, A>,
	): readonly (CardBlock<SettingsEditorState<S, A>> | null)[] {
		const confirmingReset = state.confirming === SETTINGS_EDITOR_RESET_CONFIRMING;
		const level = allLevels.at(currentLevelKey(state.path));

		const notice: CardBlock<SettingsEditorState<S, A>> | null = confirmingReset
			? {
					kind: "entry",
					title: translator.translate(locale, SETTINGS_EDITOR_MESSAGES.resetConfirmTitle),
					lines: [translator.translate(locale, SETTINGS_EDITOR_MESSAGES.resetConfirmDescription)],
				}
			: state.notice === null
				? null
				: { kind: "text", content: state.notice.text };

		const entries: CardBlock<SettingsEditorState<S, A>>[] =
			level.entryLayout === "buttons"
				? buttonRows(levelButtons(level, state))
				: level.fields.map((field) => entrySection(field));

		return [
			{ kind: "text", content: `-# ${heading(state)}` },
			notice,
			...(chrome.extraBlocks?.(state, confirmingReset) ?? []),
			{ kind: "separator" },
			...chrome.preview(state),
			{ kind: "separator" },
			...entries,
			{ kind: "text", content: signature() },
		];
	}

	function cardDef(state: SettingsEditorState<S, A>): CardDef<SettingsEditorState<S, A>> {
		return { accent: EMBED_COLORS.brand, blocks: openBlocks(state) };
	}

	const mentions =
		chrome.allowedMentions === undefined ? {} : { allowedMentions: chrome.allowedMentions };

	return {
		render: (state) => ({
			layout: "card",
			card: createCard(cardDef(state)),
			// The screen's own controls, beside the card rather than inside it —
			// empty for a screen with nothing to offer here, which is what
			// `outerRow` already returns.
			controls: outerRow(state, false),
			// Always stated, empty included: this is the screen's whole set of
			// attachments, and an update that said nothing would leave the image of
			// an override that has just been cleared sitting on the message.
			files: [...chrome.filesOf(state)],
			...mentions,
		}),
		disabledControls: (state) => ({
			components: [createCard(cardDef(state)).apply(state, true), ...outerRow(state, true)],
		}),
	};
}
