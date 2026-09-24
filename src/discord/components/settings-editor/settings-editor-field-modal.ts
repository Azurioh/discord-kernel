import {
	type Attachment,
	ChannelType,
	type MessageComponentInteraction,
	type ModalBuilder,
	type ModalMessageModalSubmitInteraction,
} from "discord.js";
import {
	isPickerField,
	type SettingsEditorFieldValue,
	type SettingsEditorGroupField,
	type SettingsEditorPickerField,
	type SettingsEditorValueField,
} from "@/discord/components/settings-editor/settings-editor-fields";
import { SETTINGS_EDITOR_MESSAGES } from "@/discord/i18n";
import {
	type ChannelFieldDef,
	createModal,
	type ModalFields,
	type RoleFieldDef,
	type SelectFieldDef,
	type TextFieldDef,
	type UserFieldDef,
} from "@/discord/interaction/modal";
import type { Locale } from "@/i18n/locale";
import type { Translator } from "@/i18n/translator";

const EDITOR_FIELD_MODAL_ID = "settings-editor:field-value";
const EDITOR_GROUP_MODAL_ID = "settings-editor:group-value";

/** Generous enough to write a whole embed description without racing a timeout. */
const MODAL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * `createModal(...).build()` with no state produces the same constant
 * customId for every field modal (`EDITOR_FIELD_MODAL_ID`) and every group
 * modal (`EDITOR_GROUP_MODAL_ID`) — one identifier shared by the whole
 * editor. Combined with a `filter` that only checked the user, a stale
 * `awaitModalSubmit` left behind by a modal the administrator opened and then
 * dismissed (it keeps listening for the rest of {@link MODAL_TIMEOUT_MS})
 * would resolve on the *next* modal that same user submitted, whatever field
 * it belonged to — reported as opening "Add a game", abandoning it, then
 * declaring a request field named "Date" ending up creating a game named
 * "Date".
 *
 * The fix needs an identifier that is unique per *opening*, not just per
 * field: the field/group key alone is not enough, because the same field can
 * be reopened while an earlier, dismissed opening's wait is still alive. A
 * process-local monotonic counter appended to the key is enough for that —
 * it only has to distinguish opens within this process's own lifetime, never
 * survive a restart, and carries no notion of time, so a `Clock` would be the
 * wrong tool (and untestable without faking time for no reason).
 *
 * Making the customId dynamic like this is safe *here*: unlike a persistent
 * component, this modal is never registered on the `ComponentRouter` — both
 * `promptEditorFieldValue` and `promptEditorGroupValue` collect their
 * submission directly with `awaitModalSubmit`, a one-shot collector that
 * matches by whatever customId it is told to expect, not by the router's
 * `customId`/`customId:*` rule. A dynamic id would break the router (it needs
 * a stable prefix to keep matching after a restart); it does not break a
 * collector.
 */
let modalOpenSequence = 0;

/**
 * A customId suffix unique to one modal opening: `key` for readability when
 * debugging, plus a counter so reopening the same field still yields a
 * different id from the opening before it.
 */
function nextModalOpenState(key: string): string {
	modalOpenSequence += 1;
	return `${key}-${modalOpenSequence}`;
}

/** The customId a built modal actually carries, read back rather than reassembled. */
function customIdOf(modal: ModalBuilder): string {
	return (modal.toJSON() as { custom_id: string }).custom_id;
}

/** One image per override — the embed has exactly one slot for each. */
const MAX_UPLOADS = 1;

export interface SettingsEditorSubmission {
	/** The modal's own submit interaction — the only one still usable to answer. */
	readonly interaction: ModalMessageModalSubmitInteraction;
	/** `null` when the field came back empty, which is how an override is cleared. */
	readonly value: string | null;
	/**
	 * The uploaded image, on the fields that offer one. Always `null` elsewhere,
	 * and `null` on those when nothing was uploaded.
	 */
	readonly upload: Attachment | null;
	/**
	 * What a picker field reported. `null` when the selection was emptied — that
	 * is how such a setting is cleared. Always `null` on a value field.
	 */
	readonly ids: readonly string[] | null;
}

/**
 * Ask for one field's new value, prefilled with the current one, and wait for
 * the answer. Returns `null` on timeout or on any failure to show/collect it
 * (the administrator dismissed the modal, say) — the caller treats that as
 * "nothing happened", never as an error, and the screen stays as it was.
 *
 * `showModal` finally acknowledges `interaction`: nothing can `.update()` on it
 * again, which is why the submission carries its own interaction to answer
 * through.
 *
 * `MessageComponentInteraction` rather than `AnySelectMenuInteraction`: a menu
 * entry opens the very same modal whether it is reached by picking it from a
 * select (the embeds layout) or by clicking the button its own `Section`
 * carries (the card layout), and both interaction kinds carry `showModal` and
 * `awaitModalSubmit` from that shared base.
 */
export async function promptEditorFieldValue<F extends string>(
	interaction: MessageComponentInteraction,
	field: SettingsEditorValueField<F> | SettingsEditorPickerField<F>,
	current: SettingsEditorFieldValue,
	translator: Translator,
	locale: Locale,
): Promise<SettingsEditorSubmission | null> {
	const modal = isPickerField(field)
		? createPickerModal(field, current, translator, locale)
		: field.kind === "image"
			? createImageModal(field, current, translator, locale)
			: createTextModal(field, current, translator, locale);

	try {
		const built = modal.build(nextModalOpenState(field.key));
		const expectedCustomId = customIdOf(built);
		await interaction.showModal(built);
		const submitted = await interaction.awaitModalSubmit({
			time: MODAL_TIMEOUT_MS,
			filter: (submission) =>
				submission.user.id === interaction.user.id && submission.customId === expectedCustomId,
		});
		// A modal opened from a message submits as a `ModalMessageModalSubmit`
		// interaction — the only kind that can `.update()` the screen in place.
		// Anything else did not come from it, so it is dropped rather than answered
		// on a message it has no claim to.
		if (!submitted.isFromMessage()) {
			return null;
		}
		return { interaction: submitted, ...modal.read(submitted) };
	} catch {
		return null;
	}
}

/** What one member field of a group came back with — the group's own per-member slice. */
export interface SettingsEditorGroupMemberSubmission {
	readonly value: string | null;
	readonly upload: Attachment | null;
	readonly ids: readonly string[] | null;
}

/**
 * What a group's modal came back with, one entry per member field it declared.
 * A member absent from a submission cannot happen — every member the group
 * declares is a component of the very modal that produced this — but the type
 * stays a partial record rather than asserting it, since nothing here proves it
 * to the compiler.
 */
export type SettingsEditorGroupSubmission<F extends string> = Readonly<
	Partial<Record<F, SettingsEditorGroupMemberSubmission>>
>;

/** What opening a group's modal resolves to: the submitted values, and the one interaction left to answer through. */
export interface SettingsEditorGroupPrompt<F extends string> {
	readonly interaction: ModalMessageModalSubmitInteraction;
	readonly values: SettingsEditorGroupSubmission<F>;
}

/**
 * Ask for every setting a group declares at once, in a single modal — the
 * group's counterpart of {@link promptEditorFieldValue}. Each member is laid
 * out in the geometry its own `kind` imposes, exactly as it would if it were
 * prompted on its own, and prefilled the same way: from `currentValue`, asked
 * once per member.
 *
 * `legend` is extra text shown above the fields — a token list a message field
 * reads against, say — already counted against the modal's own five-component
 * budget by the caller that built it; `null` when the group has nothing to say
 * there.
 */
export async function promptEditorGroupValue<F extends string>(
	interaction: MessageComponentInteraction,
	group: SettingsEditorGroupField<F>,
	currentValue: (memberKey: F) => SettingsEditorFieldValue,
	legend: string | null,
	translator: Translator,
	locale: Locale,
): Promise<SettingsEditorGroupPrompt<F> | null> {
	const modal = createGroupModal(group, currentValue, legend, translator, locale);
	try {
		const built = modal.build(nextModalOpenState(group.key));
		const expectedCustomId = customIdOf(built);
		await interaction.showModal(built);
		const submitted = await interaction.awaitModalSubmit({
			time: MODAL_TIMEOUT_MS,
			filter: (submission) =>
				submission.user.id === interaction.user.id && submission.customId === expectedCustomId,
		});
		if (!submitted.isFromMessage()) {
			return null;
		}
		return { interaction: submitted, values: modal.read(submitted) };
	} catch {
		return null;
	}
}

/** Reading a group's submission back — the group's own counterpart of {@link EditorFieldModal}. */
interface EditorGroupModal<F extends string> {
	build(state?: string): ModalBuilder;
	read(interaction: ModalMessageModalSubmitInteraction): SettingsEditorGroupSubmission<F>;
}

/**
 * A group's modal: one component per member field, each in the shape its own
 * `kind` names, built through the very builders a single-field modal uses —
 * `createModal`'s own generic `read` is what lets this stay one function
 * whatever mix of text and picker members a group declares.
 *
 * A member of kind `image` is refused here rather than supported: an image
 * field needs two components of its own (the upload, and the address beside
 * it), which a group already spending one slot per member — and possibly one
 * more on `legend` — has no general room for, and no group this repository
 * declares needs one.
 */
function createGroupModal<F extends string>(
	group: SettingsEditorGroupField<F>,
	currentValue: (memberKey: F) => SettingsEditorFieldValue,
	legend: string | null,
	translator: Translator,
	locale: Locale,
): EditorGroupModal<F> {
	const label = translator.translate(locale, group.labelKey);
	const fields: ModalFields = {};
	for (const member of group.fields) {
		const current = currentValue(member.key);
		if (isPickerField(member)) {
			fields[member.key] = pickerFieldDef(
				member,
				pickerShared(member, translator, locale),
				current.picked,
				translator,
				locale,
			);
			continue;
		}
		if (member.kind === "image") {
			throw new Error(
				`Settings editor group "${group.key}" declares member "${member.key}" of kind "image"; a group's modal has no room for the separate upload component an image field needs. Declare it as "text" instead.`,
			);
		}
		fields[member.key] = valueFieldDefOf(member, current, translator, locale);
	}

	const modal = createModal({
		id: EDITOR_GROUP_MODAL_ID,
		title: modalTitle(label, translator, locale),
		...(legend === null ? {} : { legend }),
		fields,
	});
	return {
		build: (state) => modal.build(state),
		read: (interaction) => {
			const raw = modal.read(interaction) as unknown as Record<
				string,
				string | null | readonly string[]
			>;
			const values: Partial<Record<F, SettingsEditorGroupMemberSubmission>> = {};
			for (const member of group.fields) {
				values[member.key] = isPickerField(member)
					? { value: null, upload: null, ids: raw[member.key] as readonly string[] | null }
					: { value: raw[member.key] as string | null, upload: null, ids: null };
			}
			return values;
		},
	};
}

/**
 * Reading a submission back, whichever of the two modals produced it. Both
 * answer the same two questions, so the caller never branches on which was
 * shown.
 */
interface EditorFieldModal {
	build(state?: string): ModalBuilder;
	read(interaction: ModalMessageModalSubmitInteraction): {
		value: string | null;
		upload: Attachment | null;
		ids: readonly string[] | null;
	};
}

function modalTitle(label: string, translator: Translator, locale: Locale): string {
	return translator.translate(locale, SETTINGS_EDITOR_MESSAGES.modalTitle, { field: label });
}

/** The greyed-out example inside the box, for a field that declared one. */
function placeholderOf<F extends string>(
	field: SettingsEditorValueField<F>,
	translator: Translator,
	locale: Locale,
): { placeholder?: string } {
	if (field.placeholderKey === undefined) {
		return {};
	}
	return {
		placeholder: translator.translate(locale, field.placeholderKey, field.placeholderParams),
	};
}

/**
 * The one text-input component a `text`-kind field builds, whether it is
 * prompted on its own (via {@link createTextModal}) or as a member of a group
 * — the shape a group's modal needs from `createModal`'s own generic `read`
 * is exactly this, unlabelled by which caller asked for it.
 */
function valueFieldDefOf<F extends string>(
	field: SettingsEditorValueField<F>,
	current: SettingsEditorFieldValue,
	translator: Translator,
	locale: Locale,
): TextFieldDef {
	return {
		kind: "text",
		label: translator.translate(locale, field.labelKey),
		description: translator.translate(
			locale,
			field.helperKey ?? SETTINGS_EDITOR_MESSAGES.modalHelper,
		),
		style: field.style,
		required: false,
		maxLength: field.maxLength,
		...placeholderOf(field, translator, locale),
		...(current.text === null ? {} : { value: current.text }),
	};
}

/** Every field but the images: one optional text input, emptied to clear. */
function createTextModal<F extends string>(
	field: SettingsEditorValueField<F>,
	current: SettingsEditorFieldValue,
	translator: Translator,
	locale: Locale,
): EditorFieldModal {
	const label = translator.translate(locale, field.labelKey);
	const modal = createModal({
		id: EDITOR_FIELD_MODAL_ID,
		title: modalTitle(label, translator, locale),
		fields: { value: valueFieldDefOf(field, current, translator, locale) },
	});
	return {
		build: (state) => modal.build(state),
		read: (interaction) => ({ value: modal.read(interaction).value, upload: null, ids: null }),
	};
}

/**
 * An image field: a file upload and the address input side by side, both
 * optional, two of the five components a modal may carry.
 *
 * Offering both is what keeps an administrator from having to host the file
 * somewhere first, without taking away the address that a guild already
 * pointing at its own CDN relies on.
 */
function createImageModal<F extends string>(
	field: SettingsEditorValueField<F>,
	current: SettingsEditorFieldValue,
	translator: Translator,
	locale: Locale,
): EditorFieldModal {
	const label = translator.translate(locale, field.labelKey);
	const modal = createModal({
		id: EDITOR_FIELD_MODAL_ID,
		title: modalTitle(label, translator, locale),
		fields: {
			upload: {
				kind: "file",
				label: translator.translate(locale, SETTINGS_EDITOR_MESSAGES.modalUploadLabel),
				description: translator.translate(locale, SETTINGS_EDITOR_MESSAGES.modalUploadHelper, {
					max: field.uploadMaxMib ?? 0,
				}),
				required: false,
				maxValues: MAX_UPLOADS,
			},
			value: {
				kind: "text",
				label: translator.translate(locale, SETTINGS_EDITOR_MESSAGES.modalImageUrlLabel),
				description: translator.translate(
					locale,
					current.uploaded
						? SETTINGS_EDITOR_MESSAGES.modalImageHelperUploaded
						: SETTINGS_EDITOR_MESSAGES.modalImageHelper,
				),
				style: field.style,
				required: false,
				maxLength: field.maxLength,
				...(current.text === null ? {} : { value: current.text }),
			},
		},
	});
	return {
		build: (state) => modal.build(state),
		read: (interaction) => {
			const values = modal.read(interaction);
			return { value: values.value, upload: values.upload?.[0] ?? null, ids: null };
		},
	};
}

/**
 * A picker field's modal: one select of the shape its kind names — role, user,
 * channel or a closed set of choices — prefilled with what it already holds.
 *
 * `category` narrows a channel select to {@link ChannelType.GuildCategory}: the
 * very shorthand `createPickerRow` used to express, reproduced here rather than
 * left behind now that the picker lives in a modal instead of the message.
 */
function createPickerModal<F extends string>(
	field: SettingsEditorPickerField<F>,
	current: SettingsEditorFieldValue,
	translator: Translator,
	locale: Locale,
): EditorFieldModal {
	const label = translator.translate(locale, field.labelKey);
	const modal = createModal({
		id: EDITOR_FIELD_MODAL_ID,
		title: modalTitle(label, translator, locale),
		fields: {
			value: pickerFieldDef(
				field,
				pickerShared(field, translator, locale),
				current.picked,
				translator,
				locale,
			),
		},
	});
	return {
		build: (state) => modal.build(state),
		read: (interaction) => {
			const read = modal.read(interaction) as { value: readonly string[] | null };
			return { value: null, upload: null, ids: read.value };
		},
	};
}

/**
 * What every picker component shares, whatever its own kind narrows it to —
 * used whether the field is prompted on its own or as a member of a group.
 */
function pickerShared<F extends string>(
	field: SettingsEditorPickerField<F>,
	translator: Translator,
	locale: Locale,
): {
	label: string;
	required: boolean;
	minValues?: number;
	maxValues?: number;
	placeholder?: string;
} {
	const placeholder =
		field.pickerPlaceholderKey === undefined
			? undefined
			: translator.translate(locale, field.pickerPlaceholderKey);
	return {
		label: translator.translate(locale, field.labelKey),
		// Zero is what lets the administrator clear the setting by emptying the
		// select — `createModal` then hands `null` back on an empty submission
		// instead of refusing to open with nothing picked.
		required: (field.minValues ?? 1) !== 0,
		minValues: field.minValues,
		maxValues: field.maxValues,
		...(placeholder === undefined ? {} : { placeholder }),
	};
}

/** The one component a picker modal carries, in the shape its field's kind names. */
function pickerFieldDef<F extends string>(
	field: SettingsEditorPickerField<F>,
	shared: {
		label: string;
		required: boolean;
		minValues?: number;
		maxValues?: number;
		placeholder?: string;
	},
	held: readonly string[],
	translator: Translator,
	locale: Locale,
): RoleFieldDef | UserFieldDef | ChannelFieldDef | SelectFieldDef {
	// `modal.ts`'s builders open a default whenever the key is present at all,
	// empty array included — so an empty selection is left out entirely rather
	// than handed through, the same guard `createRoleSelect` (the select-menu
	// DSL the in-message picker used) already applied.
	switch (field.kind) {
		case "role":
			return { kind: "role", ...shared, ...(held.length === 0 ? {} : { defaultRoleIds: held }) };
		case "user":
			return { kind: "user", ...shared, ...(held.length === 0 ? {} : { defaultUserIds: held }) };
		case "category":
			return {
				kind: "channel",
				...shared,
				channelTypes: [ChannelType.GuildCategory],
				...(held.length === 0 ? {} : { defaultChannelIds: held }),
			};
		case "channel":
			return {
				kind: "channel",
				...shared,
				channelTypes: field.channelTypes,
				...(held.length === 0 ? {} : { defaultChannelIds: held }),
			};
		case "choice":
			return {
				kind: "select",
				...shared,
				options: field.choices.map((choice) => ({
					label: translator.translate(locale, choice.labelKey),
					value: choice.value,
					...(choice.descriptionKey === undefined
						? {}
						: { description: translator.translate(locale, choice.descriptionKey) }),
					// Marked rather than prefilled the way an entity select's default is:
					// Discord has no "default value" concept for a string select, only a
					// per-option flag, which is also how the reader still sees which of a
					// closed set is in force.
					default: held.includes(choice.value),
				})),
			};
	}
}
