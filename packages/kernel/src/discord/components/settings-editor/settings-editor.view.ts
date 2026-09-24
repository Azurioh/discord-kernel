import {
	type ActionRowBuilder,
	EmbedBuilder,
	type MessageActionRowComponentBuilder,
	type MessageMentionOptions,
} from "discord.js";
import type { Clock } from "@/clock";
import type {
	InteractiveMessagePayload,
	InteractiveView,
} from "@/discord/components/interactive-message/interactive-message-collector";
import {
	canReturn,
	currentLevelKey,
	ROOT_LEVEL_KEY,
	type SettingsEditorLevel,
	type SettingsEditorPath,
} from "@/discord/components/settings-editor/navigation";
import {
	isGroupField,
	MAX_MODAL_COMPONENTS,
	type SettingsEditorField,
	type SettingsEditorGroupField,
} from "@/discord/components/settings-editor/settings-editor-fields";
import { SETTINGS_EDITOR_MESSAGES } from "@/discord/i18n";
import {
	type Button,
	type ComponentContext,
	createActionRow,
	createButton,
} from "@/discord/interaction/button";
import { createSelectRow, createStringSelect } from "@/discord/interaction/select-menu";
import type { CardBlock } from "@/discord/ui/card";
import { EMBED_COLORS } from "@/discord/ui/colors";
import type { MessageFile } from "@/discord/ui/message-attachments";
import type { Locale } from "@/i18n/locale";
import type { Translator } from "@/i18n/translator";

/**
 * The row type this file's own rendering builds — and, since the card layout
 * now renders its screen-level controls as an `ActionRow` beside its
 * `Container` rather than a block inside it, the type
 * `settings-editor-card.view.ts` builds the very same rows with too. Not a
 * shape a caller outside this module ever has to match (unlike
 * `SettingsEditorChrome.extraRows`, kept typed as
 * `InteractiveMessagePayload["components"]` so tournament/ticket screens that
 * implement it keep compiling unchanged).
 */
export type SettingsEditorRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

/**
 * The custom ids of one editor's controls, namespaced by the screen mounting it.
 *
 * Local to a collector rather than entries in `component-ids.ts`: an editor is
 * transient and owner-scoped, so none of these is ever routed by the persistent
 * `ComponentRouter`. They are still kept distinct per screen — two editors that
 * shared them would be indistinguishable in a log.
 */
export function editorComponentIds(prefix: string) {
	return {
		field: `${prefix}:field-select`,
		reset: `${prefix}:reset`,
		resetConfirm: `${prefix}:reset-confirm`,
		resetCancel: `${prefix}:reset-cancel`,
		back: `${prefix}:back`,
	} as const;
}

export type SettingsEditorIds = ReturnType<typeof editorComponentIds>;

/** Discord refuses a select menu carrying more than this many options. */
export const MAX_SELECT_OPTIONS = 25;

/**
 * Discord's cap on what one option shows — the same for its label and for the
 * line under it.
 */
export const MAX_SELECT_OPTION_TEXT = 100;

/**
 * Refuse a menu entry Discord would refuse, saying which one and how far over.
 *
 * A translated string is what overruns here: the English source can sit
 * comfortably under the cap while the French runs a character past it, so the
 * screen breaks in one language and not the other.
 */
function assertFits(text: string, part: "label" | "hint", field: string, locale: Locale): void {
	if (text.length > MAX_SELECT_OPTION_TEXT) {
		throw new Error(
			`Settings editor field "${field}" has a ${locale} ${part} of ${text.length} characters; a select option carries ${MAX_SELECT_OPTION_TEXT}. Shorten it: ${text}`,
		);
	}
}

/**
 * Refuse a group whose modal Discord would refuse, naming the group and how
 * far over it runs.
 *
 * `hasGroupLegend` reserves one slot of the budget whenever the screen
 * declares a `groupLegend` hook at all — the hook is one per screen, not one
 * per group, so a group that never actually gets a legend still budgets as if
 * it might rather than pass only to overflow the day a legend is added to it.
 */
function assertGroupFits<F extends string>(
	group: SettingsEditorGroupField<F>,
	hasGroupLegend: boolean,
): void {
	const budget = hasGroupLegend ? MAX_MODAL_COMPONENTS - 1 : MAX_MODAL_COMPONENTS;
	if (group.fields.length > budget) {
		throw new Error(
			`Settings editor group "${group.key}" declares ${group.fields.length} member fields; a modal holds ${MAX_MODAL_COMPONENTS}${
				hasGroupLegend ? " (one of which this screen reserves for a legend)" : ""
			}. It overflows by ${group.fields.length - budget}.`,
		);
	}
}

/**
 * The outcome of the last action, and whether it went through.
 *
 * The two are told apart because they are not worth the same room. A
 * confirmation is already visible where it matters — the preview under it
 * shows the change — so at the root it goes unsaid rather than leaving an
 * embed sitting there until the next action. A refusal has no other trace:
 * nothing was written, the previous value stands, and only this says why.
 */
export interface SettingsEditorNotice {
	readonly text: string;
	readonly tone: "confirmation" | "refusal";
}

/**
 * The value {@link SettingsEditorState.confirming} carries while the editor's
 * own reset is waiting for its second click — the one action every screen
 * shares, so it is the one value the generic editor itself recognises. Any
 * other value is a screen's own: an accessory button (a game's own "remove")
 * that arms itself on the first click and fires on the second reads its own
 * key back from `confirming`, and the generic editor never looks at it.
 */
export const SETTINGS_EDITOR_RESET_CONFIRMING = "reset";

/**
 * What every editor screen holds, whatever it is editing.
 *
 * `subject` is the screen's own business — the guild's settings for the panel,
 * the shown ticket type for a welcome message — and the editor never looks
 * inside it: it is handed back to the callbacks that read and write it.
 */
export interface SettingsEditorState<S, A> {
	readonly subject: S;
	/**
	 * The uploaded images `subject` refers to, already loaded.
	 *
	 * The screen carries them itself, exactly as the published message does: an
	 * `attachment://` reference only resolves against the files of the very
	 * message it appears in, so a preview that did not carry them would show a
	 * broken image instead of what members see.
	 */
	readonly assets: readonly A[];
	/** Outcome of the last action. `null` until the first one. */
	readonly notice: SettingsEditorNotice | null;
	/**
	 * The action waiting for its second click, naming it — `null` while nothing
	 * is. {@link SETTINGS_EDITOR_RESET_CONFIRMING} is the editor's own; any other
	 * string is a screen's, for an accessory button that must not fire on a
	 * single misplaced click. A generic `string`, not a dedicated boolean, is
	 * what lets the two share the one field instead of a screen needing a
	 * confirmation flag of its own beside it.
	 *
	 * Held here rather than beside the collector because it is what the screen
	 * renders: while the editor's own reset is the one waiting, the question
	 * replaces the intro, the controls become the confirm/cancel pair, and the
	 * menu goes inert.
	 */
	readonly confirming: string | null;
	/**
	 * Where the screen currently is, outermost first. Never empty — the root is
	 * always its first entry.
	 */
	readonly path: SettingsEditorPath;
}

/**
 * What every screen's chrome states, whichever layout it renders in.
 *
 * Split from {@link SettingsEditorChrome} rather than folded into it: the two
 * layout branches disagree on `preview`'s own return type and on which extra
 * hooks make sense at all, so only what both answer identically belongs on a
 * shared base.
 */
interface SettingsEditorChromeCommon<S, A> {
	readonly titleKey: string;
	/**
	 * What the administrator is doing here, shown under the heading of a level
	 * below the root.
	 *
	 * Omitted by a screen with no depth: the root shows no heading of its own —
	 * the menu and the preview under it already say what the screen is for — so
	 * an intro declared by a flat screen would never be read.
	 */
	readonly introKey?: string;
	/**
	 * An extra block held under the intro for as long as the screen is on a level
	 * that shows one — the welcome editor's list of placeholders, which is worth
	 * nothing if it is only visible inside the modal.
	 */
	readonly legend?: string;
	/**
	 * The files the message must carry for `preview` to resolve.
	 *
	 * The editor holds the caller's assets without ever looking inside them —
	 * only the caller knows how one of its own assets maps to an attachment — so
	 * turning them into files is asked for here rather than assumed. A screen
	 * with no uploads returns an empty list and carries no asset concept at all.
	 */
	filesOf(state: SettingsEditorState<S, A>): readonly MessageFile[];
	/**
	 * Whether anything is customised — what makes the reset worth offering.
	 * Left out entirely by a screen with nothing a reset could put back (every
	 * setting it holds is one it cannot be without): its absence is what tells
	 * the editor this screen offers no reset at all, rather than a function
	 * that answers `false` and would have to be trusted never to drift from
	 * its own name.
	 */
	hasOverrides?(subject: S): boolean;
	/**
	 * Who the preview may notify. Stated by a screen whose preview renders text an
	 * administrator wrote: a `{staff}` expanded into real role mentions must never
	 * ping the team because somebody looked at it.
	 */
	readonly allowedMentions?: MessageMentionOptions;
}

/**
 * The embeds branch of {@link SettingsEditorChrome} — what every screen
 * declared before the card layout existed.
 *
 * `layout` is optional here, and only here: a screen that predates the card
 * layout names no layout at all, and must keep compiling unchanged. Add a
 * `layout: "card"` key to a screen and it is this branch no longer.
 */
export interface SettingsEditorEmbedsChrome<S, A> extends SettingsEditorChromeCommon<S, A> {
	readonly layout?: "embeds";
	readonly selectPlaceholderKey: string;
	/** The embed under the screen's own, rendered from the subject. */
	preview(state: SettingsEditorState<S, A>): EmbedBuilder;
	/**
	 * Rows shown above the field menu — a type picker, a previewed button. Their
	 * behaviour, when they have any, is registered by the caller as an
	 * `InteractiveSelect`; this is only their rendering.
	 */
	extraRows?(
		state: SettingsEditorState<S, A>,
		disabled: boolean,
	): InteractiveMessagePayload["components"];
}

/**
 * The card branch of {@link SettingsEditorChrome}: a screen rendered as one
 * Components V2 card instead of two embeds and four rows of components.
 *
 * `preview` returns card blocks rather than an `EmbedBuilder` — spread
 * straight into the card the editor builds — and `extraBlocks` replaces
 * `extraRows` the same way, in the vocabulary a card understands instead of a
 * message's own action rows.
 */
export interface SettingsEditorCardChrome<S, A> extends SettingsEditorChromeCommon<S, A> {
	readonly layout: "card";
	/** The card's own blocks, rendered from the subject. */
	preview(
		state: SettingsEditorState<S, A>,
	): readonly (CardBlock<SettingsEditorState<S, A>> | null)[];
	/**
	 * Blocks shown above the preview — a type picker, a previewed button. Their
	 * behaviour, when they have any, is registered by the caller as an
	 * `InteractiveSelect`; this is only their rendering.
	 */
	extraBlocks?(
		state: SettingsEditorState<S, A>,
		disabled: boolean,
	): readonly (CardBlock<SettingsEditorState<S, A>> | null)[];
	/**
	 * How the root level offers its entries — the very meaning
	 * {@link import("@/discord/components/settings-editor/navigation").SettingsEditorLevel.entryLayout}
	 * carries for every level below it, mirrored here for the one level that is
	 * never itself a `SettingsEditorLevel`. Defaults to `"sections"`.
	 */
	readonly entryLayout?: "sections" | "buttons";
	/**
	 * The buttons the screen adds to the end of the entries row of the current
	 * `"buttons"`-layout level — what acts on the entry shown there rather than
	 * on a setting, such as removing it. A card layout only, and only a
	 * `"buttons"` level: a `"sections"` level has no one row for this to join,
	 * each entry already carrying its own accessory.
	 *
	 * A screen's own action waiting on its second click takes the row over
	 * entirely rather than sharing it with the level's own buttons — the same
	 * rule the editor's own reset already follows for the row below the card
	 * (see `resetButtons`/`outerButtons`), applied here to a level's own
	 * entries instead: while `state.confirming` names anything at all, the row
	 * is exactly what this hook returns, nothing else. A hook telling apart its
	 * own key from another action's, or from the editor's own reset, is what
	 * lets it answer with the confirm/cancel pair only where it actually asked
	 * the question.
	 */
	entryActions?(state: SettingsEditorState<S, A>): readonly Button<SettingsEditorState<S, A>>[];
}

/**
 * How one screen dresses the generic editor.
 *
 * A discriminated union rather than one shape with an optional `layout`, for
 * the same reason {@link InteractiveMessagePayload} is one: an embeds screen
 * and a card screen answer different questions — a card's `preview` returns
 * blocks, not an `EmbedBuilder`. Mixing the two shapes must fail to compile
 * rather than build a chrome the editor cannot render.
 */
export type SettingsEditorChrome<S, A> =
	| SettingsEditorEmbedsChrome<S, A>
	| SettingsEditorCardChrome<S, A>;

/** What each button does. Supplied by the controller, which owns the writes. */
export interface SettingsEditorActions<S, A> {
	/** Asks the question; it is `onConfirmReset` that writes. */
	onReset: (ctx: ComponentContext<SettingsEditorState<S, A>>) => Promise<void>;
	onConfirmReset: (ctx: ComponentContext<SettingsEditorState<S, A>>) => Promise<void>;
	onCancelReset: (ctx: ComponentContext<SettingsEditorState<S, A>>) => Promise<void>;
	/**
	 * Goes back to the level above. At the root there is nothing to undo, so the
	 * control is not rendered and this is never reached from there.
	 */
	onReturn: (ctx: ComponentContext<SettingsEditorState<S, A>>) => Promise<void>;
}

/**
 * The screen's buttons, grouped by the state that shows them — plus `all`, the
 * set the collector routes on. The collector matches a click against the buttons
 * it was mounted with, not against what is currently rendered, so a control
 * missing from `all` would be a dead click whichever state put it up.
 */
export interface SettingsEditorButtons<S, A> {
	/**
	 * Rendered only where there is something to reset — see {@link resetButtons}.
	 * Nothing customised means the reset would write the values already stored:
	 * an alarming control that does nothing, and a confirmation asked over
	 * nothing. Absent rather than disabled, for the same reason the return
	 * control below is: a greyed control asks the reader to work out why it is
	 * there at all.
	 */
	readonly reset: Button<SettingsEditorState<S, A>>;
	readonly confirming: Button<SettingsEditorState<S, A>>[];
	/** Rendered beside `reset` below the root. */
	readonly returning: Button<SettingsEditorState<S, A>>[];
	readonly all: Button<SettingsEditorState<S, A>>[];
}

export function createEditorButtons<S, A>(
	ids: SettingsEditorIds,
	translator: Translator,
	locale: Locale,
	actions: SettingsEditorActions<S, A>,
): SettingsEditorButtons<S, A> {
	const reset = createButton<SettingsEditorState<S, A>>({
		id: ids.reset,
		label: translator.translate(locale, SETTINGS_EDITOR_MESSAGES.resetButton),
		style: "danger",
		onClick: actions.onReset,
	});
	// Cancel takes the slot the reset button just occupied, so a second reflex
	// click on the same spot backs out instead of carrying the wipe through.
	const confirming = [
		createButton<SettingsEditorState<S, A>>({
			id: ids.resetCancel,
			label: translator.translate(locale, SETTINGS_EDITOR_MESSAGES.resetCancelButton),
			style: "secondary",
			onClick: actions.onCancelReset,
		}),
		createButton<SettingsEditorState<S, A>>({
			id: ids.resetConfirm,
			label: translator.translate(locale, SETTINGS_EDITOR_MESSAGES.resetConfirmButton),
			emoji: "🗑️",
			style: "danger",
			onClick: actions.onConfirmReset,
		}),
	];
	const returning = [
		createButton<SettingsEditorState<S, A>>({
			id: ids.back,
			label: translator.translate(locale, SETTINGS_EDITOR_MESSAGES.backButton),
			emoji: "◀️",
			style: "secondary",
			onClick: actions.onReturn,
		}),
	];
	// `all` carries the reset and return buttons whether or not the current
	// state shows them: the collector routes on what it was mounted with, not
	// on what is rendered.
	return { reset, confirming, returning, all: [reset, ...confirming, ...returning] };
}

/**
 * The reset control, but only where {@link SettingsEditorChrome.hasOverrides}
 * says there is something to reset — the one piece of `buttons.reset`'s
 * absence every layout builds the same way, so `createEditorView` and
 * `createCardEditorView` agree on when it shows without repeating the check.
 */
export function resetButtons<S, A>(
	buttons: SettingsEditorButtons<S, A>,
	chrome: SettingsEditorChrome<S, A>,
	state: SettingsEditorState<S, A>,
): Button<SettingsEditorState<S, A>>[] {
	return (chrome.hasOverrides?.(state.subject) ?? false) ? [buttons.reset] : [];
}

/**
 * What every embed the editor owns is signed with: the bot it comes from, and
 * when the screen was last refreshed.
 */
export interface SettingsEditorDressing {
	readonly clock: Clock;
	/**
	 * The bot's own avatar, beside the footer text. `null` when the client has no
	 * user to read it from — the footer is then text alone rather than a broken
	 * image.
	 */
	readonly iconUrl: string | null;
}

/**
 * The editor screen: a live preview of what is being edited, the controls that
 * change it, and — where it has something to say — the screen's own embed above
 * them.
 *
 * The preview is the screen's whole point, which is why it is rendered from the
 * very resolution the published message goes through — that is the chrome's
 * side of the bargain, not this one's.
 */
export function createEditorView<S, A, F extends string>(
	ids: SettingsEditorIds,
	fields: readonly SettingsEditorField<F>[],
	levels: readonly SettingsEditorLevel<F>[] | undefined,
	buttons: SettingsEditorButtons<S, A>,
	chrome: SettingsEditorEmbedsChrome<S, A>,
	translator: Translator,
	locale: Locale,
	dressing: SettingsEditorDressing,
	/**
	 * Whether this screen's `groupLegend` hook is declared at all — one hook for
	 * the whole screen, not per group, so every group here reserves the one
	 * component a legend would cost rather than validate against a budget only
	 * some of them will actually spend it against.
	 */
	hasGroupLegend = false,
): InteractiveView<SettingsEditorState<S, A>> {
	// None of the three varies with the state, so each is worded once instead of
	// on every render.
	const screenTitle = translator.translate(locale, chrome.titleKey);
	const intro =
		chrome.introKey === undefined ? null : translator.translate(locale, chrome.introKey);
	// Separates the levels in the heading trail.
	const BREADCRUMB_SEPARATOR = " › ";
	const body = [intro, chrome.legend].filter(
		(part): part is string => part !== undefined && part !== null,
	);

	// The root is a level like any other, named after the screen itself, so
	// rendering never special-cases "no depth declared".
	const root: SettingsEditorLevel<F> = { key: ROOT_LEVEL_KEY, titleKey: chrome.titleKey, fields };
	const allLevels: readonly SettingsEditorLevel<F>[] = [root, ...(levels ?? [])];

	// A level's fields are authored, not accumulated: passing more than a menu can
	// hold is a mistake in the declaration, and Discord would reject the whole
	// message rather than show the first 25. Failing here names the level; failing
	// at render time would only say the message was invalid.
	//
	// Lists that *grow* — a guild's ticket types, its permission grants — are the
	// screen's own to page, through `extraRows`. See research D7.
	for (const level of allLevels) {
		if (level.fields.length > MAX_SELECT_OPTIONS) {
			throw new Error(
				`Settings editor level "${level.key}" declares ${level.fields.length} entries; a select menu holds ${MAX_SELECT_OPTIONS}. Split it into a deeper level.`,
			);
		}
		// Same reasoning, one level down: a translation over the cap makes the
		// builder refuse the whole menu, and it does so with `CombinedPropertyError`
		// — whose own message is the constant "Received one or more errors". Failing
		// here names the entry, the locale and the length; failing at render time
		// left a screen that would not open and a log that said nothing.
		//
		// It bites the translations rather than the English source, which is why it
		// is checked per locale at build time rather than trusted once.
		for (const field of level.fields) {
			assertFits(translator.translate(locale, field.labelKey), "label", field.key, locale);
			assertFits(translator.translate(locale, field.hintKey), "hint", field.key, locale);
			if (isGroupField(field)) {
				assertGroupFits(field, hasGroupLegend);
			}
		}
	}

	// A path entry naming no declared level cannot happen — only a level field
	// puts one there — but falling back to the root keeps a corrupted state
	// showing a usable screen rather than an empty one.
	function levelAt(key: string): SettingsEditorLevel<F> {
		return allLevels.find((level) => level.key === key) ?? root;
	}

	// One menu per level, built once: the options of a level never vary with the
	// state, only which level is showing does.
	const menus = new Map(
		allLevels.map((level) => [
			level.key,
			createStringSelect({
				id: ids.field,
				placeholder: translator.translate(locale, chrome.selectPlaceholderKey),
				options: level.fields.map((field) => ({
					label: translator.translate(locale, field.labelKey),
					value: field.key,
					description: translator.translate(locale, field.hintKey),
				})),
			}),
		]),
	);

	function menuFor(state: SettingsEditorState<S, A>) {
		return menus.get(currentLevelKey(state.path)) ?? menus.get(ROOT_LEVEL_KEY);
	}

	/**
	 * Where the reader is, as a trail rather than only the current name: a level
	 * called "Roles" says nothing on its own about which type it belongs to.
	 */
	function heading(state: SettingsEditorState<S, A>): string {
		return state.path
			.map((key) => translator.translate(locale, levelAt(key).titleKey))
			.join(BREADCRUMB_SEPARATOR);
	}

	/**
	 * How the embeds the editor owns are signed: the screen they belong to, the
	 * bot they come from, and when they were last rendered.
	 *
	 * A preview the chrome did not claim as its own is left out of this — it is
	 * the message members will see, and signing it would show the administrator
	 * something nobody else gets, on an embed whose footer is itself one of the
	 * fields being edited.
	 */
	function dress(embed: EmbedBuilder): EmbedBuilder {
		return embed
			.setFooter({
				text: screenTitle,
				...(dressing.iconUrl === null ? {} : { iconURL: dressing.iconUrl }),
			})
			.setTimestamp(dressing.clock.now());
	}

	/**
	 * The screen's own embed, above the preview — or nothing at all.
	 *
	 * At the root it is dropped unless something was refused: the menu and the
	 * preview under it already say what the screen is for, so an intro repeating
	 * that on every render is a paragraph to read past on the way to one's own
	 * settings — and a confirmation is an embed that would then sit there,
	 * outliving what it confirms, until the next action. A level down it earns
	 * its place: it is what says where the administrator is, and it carries the
	 * legend the fields there need.
	 */
	function headerEmbed(state: SettingsEditorState<S, A>): EmbedBuilder | null {
		if (state.confirming === SETTINGS_EDITOR_RESET_CONFIRMING) {
			// The pending question takes the header outright: an intro inviting the
			// administrator to pick a field would read as though the screen were
			// still waiting for one.
			return dress(
				new EmbedBuilder()
					.setColor(EMBED_COLORS.brand)
					.setTitle(translator.translate(locale, SETTINGS_EDITOR_MESSAGES.resetConfirmTitle))
					.setDescription(
						translator.translate(locale, SETTINGS_EDITOR_MESSAGES.resetConfirmDescription),
					),
			);
		}
		if (!canReturn(state.path)) {
			// A confirmation goes unsaid here: the change it reports is already on
			// screen, in the preview directly underneath.
			return state.notice === null || state.notice.tone !== "refusal"
				? null
				: dress(new EmbedBuilder().setColor(EMBED_COLORS.brand).setDescription(state.notice.text));
		}
		// Below the root the embed is up anyway, carrying the trail and the legend,
		// so a confirmation costs no room of its own and rides along.
		const description = [...(state.notice === null ? [] : [state.notice.text]), ...body];
		const embed = dress(new EmbedBuilder().setColor(EMBED_COLORS.brand).setTitle(heading(state)));
		return description.length === 0 ? embed : embed.setDescription(description.join("\n\n"));
	}

	/**
	 * The screen, top to bottom. The preview is always the last embed — the header
	 * above it is only there when it has something to say.
	 */
	function embeds(state: SettingsEditorState<S, A>): EmbedBuilder[] {
		const preview = chrome.preview(state);
		const header = headerEmbed(state);
		return header === null ? [preview] : [header, preview];
	}

	function controls(state: SettingsEditorState<S, A>, disabled: boolean): SettingsEditorRow[] {
		// The extra rows go inert with the rest while the question is up: the
		// screen is asking one thing, and picking another subject underneath it
		// would answer a different one.
		const confirmingReset = state.confirming === SETTINGS_EDITOR_RESET_CONFIRMING;
		const extra = chrome.extraRows?.(state, disabled || confirmingReset) ?? [];
		const menu = menuFor(state);
		if (confirmingReset) {
			return [
				...extra,
				...(menu === undefined ? [] : [createSelectRow(menu, true)]),
				createActionRow(buttons.confirming, state, { disableAll: disabled }),
			];
		}
		// The return control is absent at the root rather than disabled, and the
		// reset is absent wherever `resetButtons` says there is nothing to reset:
		// an enabled control that does nothing reads as a defect, and a greyed one
		// asks the reader to work out why. With neither offered — a flat screen
		// with nothing to reset — there is nothing left to put in this row at all,
		// so it is left out rather than sent as an `ActionRow` with no button in it,
		// which Discord refuses outright.
		const row = [
			...resetButtons(buttons, chrome, state),
			...(canReturn(state.path) ? buttons.returning : []),
		];
		return [
			...extra,
			...(menu === undefined ? [] : [createSelectRow(menu, disabled)]),
			...(row.length === 0 ? [] : [createActionRow(row, state, { disableAll: disabled })]),
		];
	}

	const mentions =
		chrome.allowedMentions === undefined ? {} : { allowedMentions: chrome.allowedMentions };

	return {
		render: (state) => ({
			embeds: embeds(state),
			components: controls(state, false),
			// Always stated, empty included: this is the screen's whole set of
			// attachments, and an update that said nothing would leave the image
			// of an override that has just been cleared sitting on the message.
			files: [...chrome.filesOf(state)],
			...mentions,
		}),
		// No `files`: neutralising the controls must leave the preview's image
		// exactly where it is.
		disabledControls: (state) => ({ components: controls(state, true) }),
	};
}
