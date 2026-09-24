import type {
	ChatInputCommandInteraction,
	MessageComponentInteraction,
	ModalMessageModalSubmitInteraction,
} from "discord.js";
import type { Clock } from "@/clock";
import {
	type InteractiveMessageHandle,
	type InteractiveSelect,
	type InteractiveView,
	type StateStore,
	toMessageEditOptions,
} from "@/discord/components/interactive-message/interactive-message-collector";
import { mountInteractiveMessage } from "@/discord/components/interactive-message/mount-interactive-message";
import {
	popLevel,
	pushLevel,
	ROOT_LEVEL_KEY,
	type SettingsEditorLevel,
} from "@/discord/components/settings-editor/navigation";
import {
	createEditorButtons,
	createEditorView,
	SETTINGS_EDITOR_RESET_CONFIRMING,
	type SettingsEditorChrome,
	type SettingsEditorIds,
	type SettingsEditorState,
} from "@/discord/components/settings-editor/settings-editor.view";
import {
	createCardEditorView,
	fieldButtonId,
} from "@/discord/components/settings-editor/settings-editor-card.view";
import type {
	SettingsEditorGroupSubmission,
	SettingsEditorSubmission,
} from "@/discord/components/settings-editor/settings-editor-field-modal";
import {
	promptEditorFieldValue,
	promptEditorGroupValue,
} from "@/discord/components/settings-editor/settings-editor-field-modal";
import {
	editorField,
	isEditorField,
	isGroupField,
	isPickerField,
	isValueField,
	type SettingsEditorField,
	type SettingsEditorFieldValue,
	type SettingsEditorGroupField,
} from "@/discord/components/settings-editor/settings-editor-fields";
import { SETTINGS_EDITOR_MESSAGES } from "@/discord/i18n";
import { type Button, type ComponentContext, createButton } from "@/discord/interaction/button";
import { BusinessError } from "@/errors/business-error";
import { describeError } from "@/errors/describe-error";
import { resolveBusinessMessage } from "@/i18n/business-message";
import type { Locale } from "@/i18n/locale";
import type { Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";

/**
 * What one write leaves behind: the new subject, and the files the message must
 * now carry.
 *
 * Files, not the caller's own notion of an asset: the editor attaches them and
 * never looks further, so a caller with no uploads at all is not made to carry
 * the concept.
 */
export interface SettingsEditorWrite<S, A> {
	readonly subject: S;
	readonly assets: readonly A[];
}

export interface SettingsEditorOptions<S, A, F extends string> {
	/**
	 * The screen's own custom ids, from `editorComponentIds`. Declared by the
	 * screen rather than derived here, so a test — and a log — names the very
	 * control an administrator clicked.
	 */
	readonly ids: SettingsEditorIds;
	readonly fields: readonly SettingsEditorField<F>[];
	/**
	 * The levels below the root, if the screen has any. Omitted by a flat screen,
	 * which then never renders a return control.
	 */
	readonly levels?: readonly SettingsEditorLevel<F>[];
	readonly initial: SettingsEditorWrite<S, A>;
	/** What the modal for `field` opens on. */
	currentValue(subject: S, field: F): SettingsEditorFieldValue;
	/**
	 * Persist one field — its typed value, its upload, or what a picker's select
	 * came back with, whichever `submission` carries.
	 *
	 * A `BusinessError` — an unsupported placeholder, a colour that is not one, an
	 * oversized upload — is caught here and shown as a notice: nothing is written,
	 * the previous value stands, and the screen stays open saying why in the
	 * administrator's language.
	 *
	 * `submission.interaction` is the modal's own submit interaction, handed over
	 * because a screen lives for minutes: a caller whose write is restricted must
	 * be able to re-read who is asking *now*, not who opened the screen.
	 */
	save(
		subject: S,
		field: F,
		submission: SettingsEditorSubmission,
	): Promise<SettingsEditorWrite<S, A>>;
	/**
	 * Persist a group's whole modal at once — one write, whatever business
	 * refusal any of its members can raise refusing before any of it lands.
	 * Split across several calls, a refusal partway through would leave the
	 * fields before it written while the administrator is told the group
	 * failed; the module deciding what "one write" means for its own group is
	 * what keeps that from happening (a service already taking a partial patch,
	 * most often, the very shape a group's submission already is).
	 *
	 * Required only of a screen that declares a `group`-kind field — never
	 * called otherwise, so a screen with none may leave it out.
	 */
	saveGroup?(
		subject: S,
		group: F,
		submissions: SettingsEditorGroupSubmission<F>,
		interaction: ModalMessageModalSubmitInteraction,
	): Promise<SettingsEditorWrite<S, A>>;
	/**
	 * Extra text shown inside a group's modal, above its member fields — a
	 * token legend whose content depends on the subject (a guild's own declared
	 * request lines) and so cannot be declared statically alongside the group
	 * the way its label and hint are. `null`, or the hook left out entirely, is
	 * a group with nothing to say there.
	 */
	groupLegend?(subject: S, group: F): string | null;
	/** Clear every override of the shown subject, uploads included. */
	reset(subject: S): Promise<SettingsEditorWrite<S, A>>;
	readonly chrome: SettingsEditorChrome<S, A>;
	/**
	 * Behaviour for whatever the chrome renders above the field menu — the
	 * welcome editor's type picker.
	 */
	readonly selects?: InteractiveSelect<SettingsEditorState<S, A>>[];
	/**
	 * Behaviour for the buttons the chrome renders beside the editor's own.
	 *
	 * The counterpart of {@link selects}, and needed for the same reason: a screen
	 * whose subject is a list needs controls that add to it and remove from it, and
	 * those are buttons. Without this the chrome could draw them and nothing would
	 * route the click — which is why the welcome preview's look-alikes are declared
	 * permanently disabled rather than merely left unhandled.
	 *
	 * The editor renders none of them itself: what appears on screen is whatever
	 * `chrome.extraRows`/`chrome.extraBlocks` puts there, level by level.
	 * Registering a button that no row or block carries is harmless, and is how
	 * a control confined to one level works.
	 */
	readonly buttons?: Button<SettingsEditorState<S, A>>[];
	/**
	 * What one write changes outside the screen — a published panel that names
	 * a ticket type, say. Called after every write that actually lands, never
	 * after a refusal, since nothing changed for it to report then.
	 *
	 * This screen has no "done" control any more, and so no reliable moment
	 * that says "the administrator has finished" — only the message being
	 * dismissed, which nothing here is told about. Republishing used to wait
	 * for that moment on purpose, so a member watching the public result never
	 * saw the half-finished states an administrator passes through on the way
	 * to the setting they meant. That trade is deliberately given up: a public
	 * page that is current beats one that is merely correct but stale for
	 * however long this administrator takes, or forever if the process
	 * restarts before they are done.
	 *
	 * A throw here never reaches the administrator as a refusal — see
	 * `applyChange`'s own doc: by the time this runs, the write it reports on
	 * has already succeeded, and telling them otherwise would be a lie. It is
	 * logged instead and the screen still confirms.
	 */
	onWritten?: () => Promise<void>;
	readonly translator: Translator;
	readonly locale: Locale;
	/** Stamps the screen's own embeds, so a render says when it was last refreshed. */
	readonly clock: Clock;
	readonly logger: Logger;
}

/**
 * The mounted screen, filled in once `mountInteractiveMessage` returns. The
 * controls need their behaviour before the message exists, so they close over
 * this cell — the shape `delete.subcommand.ts` uses for the same reason.
 */
interface MountedScreen<S, A> {
	screen:
		| (InteractiveMessageHandle & { readonly store: StateStore<SettingsEditorState<S, A>> })
		| null;
}

/**
 * What triggers a field's own round trip, whichever control reached it: the
 * embeds layout's field select, or a card layout's per-entry button. Both
 * {@link ComponentContext} and
 * {@link import("@/discord/components/interactive-message").SelectComponentContext}
 * satisfy this — their `interaction` is
 * `ButtonInteraction`/`AnySelectMenuInteraction` respectively, both assignable
 * to the shared `MessageComponentInteraction` base a modal round trip
 * actually needs.
 */
interface EditorTriggerContext<S> {
	readonly interaction: MessageComponentInteraction;
	readonly state: S;
	update(next: S): Promise<void>;
}

/**
 * The view, filled in once it is built. A card layout's per-field buttons must
 * exist *before* `createCardEditorView` returns — the card renders their
 * `Section` from them — yet their own `onClick` needs the very view being
 * built to re-render through. This cell is what lets the buttons close over
 * "the view, whenever it exists" instead of a value that is not there yet.
 */
interface MountedView<S, A> {
	view: InteractiveView<SettingsEditorState<S, A>> | null;
}

/**
 * Mount the editor every customisable ticket embed is edited through: a preview
 * of what members see, a menu of fields, a modal per field, and a confirmed
 * reset.
 *
 * Everything specific to *what* is being edited — where the values are read,
 * where they are written, how the preview is rendered — is supplied by the
 * caller. What lives here is the part both screens would otherwise have written
 * twice: the modal round trip, the read-at-submit-time rule, refusals turned
 * into notices, and re-rendering through the interaction that is still usable.
 *
 * Call it on an already-deferred interaction.
 */
export async function mountSettingsEditor<S, A, F extends string>(
	interaction: ChatInputCommandInteraction,
	options: SettingsEditorOptions<S, A, F>,
): Promise<InteractiveMessageHandle & { readonly store: StateStore<SettingsEditorState<S, A>> }> {
	const { translator, locale } = options;
	const { ids } = options;
	const mounted: MountedScreen<S, A> = { screen: null };
	const mountedView: MountedView<S, A> = { view: null };
	// Every level's fields, flattened: a pick is routed by key, and the key is
	// unique across the screen whichever level offered it.
	const allFields: readonly SettingsEditorField<F>[] = [
		...options.fields,
		...(options.levels ?? []).flatMap((level) => level.fields),
	];

	/**
	 * Run one write and fold its outcome into the state. A refusal is answered
	 * identically wherever it comes from: nothing changes but the notice.
	 *
	 * The `try` covers `write()` alone — a `BusinessError` out of it is a
	 * legitimate refusal to show, because nothing landed. `onWritten` runs
	 * only once that write has actually succeeded, deliberately outside that
	 * `try`: a hook failing after the data is already saved is not a refusal
	 * of the write, and folding it into the same catch would tell the
	 * administrator their change was rejected when it was not — written and
	 * called a refusal is worse than either alone.
	 *
	 * `onWritten` is a public hook; nothing here trusts it not to throw. Its
	 * failure is logged rather than shown or re-thrown: the write already
	 * landed, so the administrator is owed the confirmation of what they
	 * actually did, and a side effect that failed to keep up (a public panel
	 * not yet refreshed, say) is an incident to trace, not a message to hand
	 * back to them on a screen that has nothing to do with it.
	 */
	async function applyChange(
		state: SettingsEditorState<S, A>,
		write: () => Promise<SettingsEditorWrite<S, A>>,
		notice: string,
	): Promise<SettingsEditorState<S, A>> {
		let written: SettingsEditorWrite<S, A>;
		try {
			written = await write();
		} catch (error) {
			if (error instanceof BusinessError) {
				// A refusal is the one outcome the screen has to say out loud:
				// nothing was written, so the preview shows no trace of it.
				return {
					...state,
					notice: { text: resolveBusinessMessage(error, translator, locale), tone: "refusal" },
				};
			}
			throw error;
		}
		try {
			await options.onWritten?.();
		} catch (error) {
			options.logger.error(
				{ err: describeError(error) },
				"onWritten failed after a settings editor write had already landed",
			);
		}
		const { subject, assets } = written;
		return { ...state, subject, assets, notice: { text: notice, tone: "confirmation" } };
	}

	/** Undo one step of where the screen is: leave the level for the one above it. */
	function stepBack(clickCtx: ComponentContext<SettingsEditorState<S, A>>): Promise<void> {
		const { state } = clickCtx;
		return clickCtx.update({
			...state,
			path: popLevel(state.path),
			notice: null,
			// Whatever a screen's own accessory button was waiting to have confirmed
			// belonged to the level being left; carrying it up would let a click
			// meant for something else fire it.
			confirming: null,
		});
	}

	function fieldNotice(
		field: SettingsEditorField<F>,
		submission: SettingsEditorSubmission,
	): string {
		return translator.translate(locale, fieldNoticeKey(field, submission), {
			field: translator.translate(locale, field.labelKey),
		});
	}

	/**
	 * Edit one field: ask for its new value in a modal prefilled with the current
	 * one — a text input, an upload, or a select of the picker's own shape — save
	 * what comes back, and re-render the preview through the modal's own
	 * interaction, since `showModal` has already acknowledged the pick or click.
	 *
	 * `fieldKey` is the key of the field to edit — the select's own picked value
	 * on the embeds layout, the key baked into the button's id on the card
	 * layout — so both reach the very same round trip, and this is where they
	 * meet back up.
	 */
	async function editField(
		ctx: EditorTriggerContext<SettingsEditorState<S, A>>,
		fieldKey: string,
	): Promise<void> {
		const view = mountedView.view;
		if (view === null || !isEditorField(allFields, fieldKey)) {
			// `view` is unreachable while `null`: nothing can click a control before
			// `mountInteractiveMessage` sends the message it belongs to, and `view` is
			// assigned before that call. An unrecognised key cannot happen from either
			// control either — both are built from `allFields` — but is not worth
			// throwing over.
			return;
		}
		const field = editorField(allFields, fieldKey);
		if (isGroupField(field)) {
			await editGroup(ctx, field);
			return;
		}
		if (!isValueField(field) && !isPickerField(field)) {
			// A level: descending writes nothing, so it answers the click by
			// re-rendering rather than going through `applyChange` — there is no
			// outcome to report.
			const state = mounted.screen?.store.read() ?? ctx.state;
			await ctx.update({
				...state,
				path: pushLevel(state.path, field.levelKey),
				// The notice belonged to the level being left; carrying it down would
				// credit this one with something that happened elsewhere. Likewise
				// whatever a screen's own accessory button on that level was waiting
				// to have confirmed.
				notice: null,
				confirming: null,
			});
			return;
		}
		const submission = await promptEditorFieldValue(
			ctx.interaction,
			field,
			options.currentValue(ctx.state.subject, fieldKey),
			translator,
			locale,
		);
		if (submission === null) {
			return;
		}

		// Read at submit time rather than at pick time: a modal can stay open for
		// minutes, during which the screen may have moved on to another subject.
		const state = mounted.screen?.store.read() ?? ctx.state;
		const next = await applyChange(
			state,
			() => options.save(state.subject, fieldKey, submission),
			fieldNotice(field, submission),
		);
		mounted.screen?.store.write(next);
		await submission.interaction.update(
			toMessageEditOptions(
				view.render(next),
				[...submission.interaction.message.attachments.values()],
				next,
			),
		);
	}

	/**
	 * Edit a group: ask for every member field it declares in one modal,
	 * prefilled the same way a single field is, and save the whole thing as one
	 * write — `options.saveGroup` is what decides what "one write" means for
	 * this group, most often a service that already takes a partial patch.
	 */
	async function editGroup(
		ctx: EditorTriggerContext<SettingsEditorState<S, A>>,
		group: SettingsEditorGroupField<F>,
	): Promise<void> {
		const view = mountedView.view;
		if (view === null) {
			return;
		}
		const prompt = await promptEditorGroupValue(
			ctx.interaction,
			group,
			(memberKey) => options.currentValue(ctx.state.subject, memberKey),
			options.groupLegend?.(ctx.state.subject, group.key) ?? null,
			translator,
			locale,
		);
		if (prompt === null) {
			return;
		}
		const { saveGroup } = options;
		if (saveGroup === undefined) {
			// A screen declaring a `group`-kind field must also declare `saveGroup` —
			// a wiring mistake in the module, not something an administrator caused,
			// so the round trip simply ends here rather than throwing at them for it.
			return;
		}

		// Read at submit time rather than at pick time, exactly as `editField`
		// does: a modal can stay open for minutes, during which the screen may
		// have moved on to another subject.
		const state = mounted.screen?.store.read() ?? ctx.state;
		const next = await applyChange(
			state,
			() => saveGroup(state.subject, group.key, prompt.values, prompt.interaction),
			translator.translate(locale, SETTINGS_EDITOR_MESSAGES.fieldSaved, {
				field: translator.translate(locale, group.labelKey),
			}),
		);
		mounted.screen?.store.write(next);
		await prompt.interaction.update(
			toMessageEditOptions(
				view.render(next),
				[...prompt.interaction.message.attachments.values()],
				next,
			),
		);
	}

	const buttons = createEditorButtons<S, A>(ids, translator, locale, {
		// Nothing is written here. Clearing an override that names an uploaded
		// image destroys the bytes with it, so the click that asks and the click
		// that carries it out are deliberately two different ones.
		onReset: (clickCtx) =>
			clickCtx.update({ ...clickCtx.state, confirming: SETTINGS_EDITOR_RESET_CONFIRMING }),
		onConfirmReset: async (clickCtx) => {
			const next = await applyChange(
				clickCtx.state,
				() => options.reset(clickCtx.state.subject),
				translator.translate(locale, SETTINGS_EDITOR_MESSAGES.resetDone),
			);
			await clickCtx.update({ ...next, confirming: null });
		},
		onCancelReset: (clickCtx) =>
			clickCtx.update({
				...clickCtx.state,
				notice: {
					text: translator.translate(locale, SETTINGS_EDITOR_MESSAGES.resetCancelled),
					tone: "confirmation",
				},
				confirming: null,
			}),
		onReturn: (clickCtx) => stepBack(clickCtx),
	});

	const dressing = {
		clock: options.clock,
		// Read from the client rather than asked of the caller: every screen wants
		// the same avatar, and it is the one thing here nobody has to configure.
		iconUrl: interaction.client.user?.displayAvatarURL() ?? null,
	};

	/**
	 * Whether `field` goes somewhere rather than editing anything — the same
	 * question `editField` itself answers for its own routing, asked here only
	 * to word its button: "Open" for a level, "Edit" for everything else.
	 */
	function isLevelField(field: SettingsEditorField<F>): boolean {
		return !isValueField(field) && !isPickerField(field) && !isGroupField(field);
	}

	/**
	 * Which layout the level owning `field` renders its entries with — the
	 * root's own fields are always `"sections"`, since the root has no picker
	 * above it for a `"buttons"` row to act on. Looked up once per field rather
	 * than threaded through as a parameter: `buildFieldButton` is called from
	 * one place, over every field up front, and this is what tells it apart
	 * from the level a field belongs to without that caller repeating the walk
	 * `createCardEditorView` already does over `options.levels`.
	 */
	const fieldEntryLayout = new Map<string, "sections" | "buttons">();
	// The root's own layout is the card chrome's `entryLayout` — the embeds
	// layout never reads this map at all, so a screen without a card chrome
	// simply leaves every root field labelled the default it is never asked for.
	const rootEntryLayout =
		options.chrome.layout === "card" ? (options.chrome.entryLayout ?? "sections") : "sections";
	for (const field of options.fields) {
		fieldEntryLayout.set(field.key, rootEntryLayout);
	}
	for (const level of options.levels ?? []) {
		const entryLayout = level.entryLayout ?? "sections";
		for (const field of level.fields) {
			fieldEntryLayout.set(field.key, entryLayout);
		}
	}

	/**
	 * The button a card layout's `Section` carries for one menu entry — what
	 * picking it from the old field select used to do, now reached by a click.
	 * Built for every field up front, whichever level declares it: a button not
	 * on the level currently shown is simply never rendered, exactly as
	 * `SettingsEditorButtons.returning` is carried whether or not the current
	 * state shows it.
	 *
	 * A level rendering its entries as a `"buttons"` row has no `Section` text
	 * to say what each one does, so its button carries the entry's own label —
	 * "Declare a game", "This game" — instead of the generic "Open"/"Edit" a
	 * `"sections"` level's accessory button wears.
	 */
	function buildFieldButton(field: SettingsEditorField<F>): Button<SettingsEditorState<S, A>> {
		const navigational = isLevelField(field);
		const label =
			fieldEntryLayout.get(field.key) === "buttons"
				? translator.translate(locale, field.labelKey)
				: translator.translate(
						locale,
						navigational
							? SETTINGS_EDITOR_MESSAGES.openLevelButton
							: SETTINGS_EDITOR_MESSAGES.editFieldButton,
					);
		return createButton<SettingsEditorState<S, A>>({
			id: fieldButtonId(ids, field.key),
			label,
			// The entry's own icon wins when it declares one — the generic one lies
			// for an entry that opens a modal to create something rather than edit
			// what is already there. Left undeclared, this is exactly the generic
			// this repository always rendered.
			emoji: field.icon ?? (navigational ? "➡️" : "✏️"),
			style: "secondary",
			// Frozen along with the rest of the screen while the editor's own reset is
			// waiting for its second click. A screen's own accessory button — a
			// game's own "remove" — gates itself on whatever *it* is waiting to have
			// confirmed instead; this one only ever means the editor's.
			disabled: (state) => state.confirming === SETTINGS_EDITOR_RESET_CONFIRMING,
			onClick: (clickCtx) => editField(clickCtx, field.key),
		});
	}

	// The card layout replaces the field select with one button per entry,
	// looked up by the very key `editField` already routes on; the embeds
	// layout keeps the select, and never builds a button nothing would render.
	const fieldButtons: Button<SettingsEditorState<S, A>>[] = [];
	const selects: InteractiveSelect<SettingsEditorState<S, A>>[] = [...(options.selects ?? [])];
	let view: InteractiveView<SettingsEditorState<S, A>>;

	if (options.chrome.layout === "card") {
		const fieldButtonMap = new Map(allFields.map((field) => [field.key, buildFieldButton(field)]));
		fieldButtons.push(...fieldButtonMap.values());
		view = createCardEditorView(
			options.fields,
			options.levels,
			buttons,
			fieldButtonMap,
			options.chrome,
			translator,
			locale,
			dressing,
		);
	} else {
		view = createEditorView(
			ids,
			options.fields,
			options.levels,
			buttons,
			options.chrome,
			translator,
			locale,
			dressing,
			// Whether *any* group on this screen might open on a legend: `groupLegend`
			// is one hook for the whole screen, not declared per group, so every group
			// here reserves the one component a legend would cost rather than risk a
			// modal that only overflows for the one group that actually gets one.
			options.groupLegend !== undefined,
		);
		selects.unshift({
			id: ids.field,
			onSelect: (pickCtx) => {
				const picked = pickCtx.values[0];
				return picked === undefined ? undefined : editField(pickCtx, picked);
			},
		});
	}
	mountedView.view = view;

	// The screen's own after the editor's, so a caller cannot shadow a control
	// the editor depends on: `mountInteractiveMessage` routes to the first match.
	const allButtons = [...buttons.all, ...fieldButtons, ...(options.buttons ?? [])];

	mounted.screen = await mountInteractiveMessage<SettingsEditorState<S, A>>(interaction, {
		initialState: {
			subject: options.initial.subject,
			assets: options.initial.assets,
			notice: null,
			confirming: null,
			path: [ROOT_LEVEL_KEY],
		},
		buttons: allButtons,
		selects,
		view,
		ownerId: interaction.user.id,
		logger: options.logger,
	});
	return mounted.screen;
}

/**
 * Which notice a submission earns, in the vocabulary its field's own kind
 * understands: an upload always says so; a picker field reads its clear from
 * `submission.ids` being `null`, a value field from `submission.value` being
 * `null` — the two never mean the same thing on the other kind of field.
 */
function fieldNoticeKey<F extends string>(
	field: SettingsEditorField<F>,
	submission: SettingsEditorSubmission,
): string {
	if (submission.upload !== null) {
		return SETTINGS_EDITOR_MESSAGES.fieldUploaded;
	}
	if (isPickerField(field)) {
		return submission.ids === null
			? SETTINGS_EDITOR_MESSAGES.fieldCleared
			: SETTINGS_EDITOR_MESSAGES.fieldSaved;
	}
	return submission.value === null
		? SETTINGS_EDITOR_MESSAGES.fieldCleared
		: SETTINGS_EDITOR_MESSAGES.fieldSaved;
}
