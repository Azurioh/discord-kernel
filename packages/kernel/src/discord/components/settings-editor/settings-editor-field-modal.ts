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
	type ModalValues,
	type RoleFieldDef,
	type SelectFieldDef,
	type TextFieldDef,
	type UserFieldDef,
} from "@/discord/interaction/modal";
import { promptModal } from "@/discord/interaction/prompt-modal";
import type { SelectBounds } from "@/discord/interaction/select-bounds";
import type { Locale } from "@/i18n/locale";
import type { Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";

const EDITOR_FIELD_MODAL_ID = "settings-editor:field-value";
const EDITOR_GROUP_MODAL_ID = "settings-editor:group-value";

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
	logger: Logger,
): Promise<SettingsEditorSubmission | null> {
	const modal = isPickerField(field)
		? createPickerModal(field, current, translator, locale)
		: field.kind === "image"
			? createImageModal(field, current, translator, locale)
			: createTextModal(field, current, translator, locale);

	let submission: ModalMessageModalSubmitInteraction | null;
	try {
		const result = await promptModal(interaction, {
			build: (state) => modal.build(`${field.key}-${state}`),
			read: (submission) => {
				if (!submission.isFromMessage()) {
					return null;
				}
				return submission;
			},
		});
		submission = result.status === "submitted" ? result.values : null;
	} catch (error) {
		logger.error(
			{ err: error, fieldKey: field.key },
			"Failed to prompt settings editor field modal",
		);
		return null;
	}
	if (submission === null) {
		return null;
	}
	return { interaction: submission, ...modal.read(submission) };
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
	logger: Logger,
): Promise<SettingsEditorGroupPrompt<F> | null> {
	const modal = createGroupModal(group, currentValue, legend, translator, locale);
	let submission: ModalMessageModalSubmitInteraction | null;
	try {
		const result = await promptModal(interaction, {
			build: (state) => modal.build(`${group.key}-${state}`),
			read: (submission) => {
				if (!submission.isFromMessage()) {
					return null;
				}
				return submission;
			},
		});
		submission = result.status === "submitted" ? result.values : null;
	} catch (error) {
		logger.error(
			{ err: error, groupKey: group.key },
			"Failed to prompt settings editor group modal",
		);
		return null;
	}
	if (submission === null) {
		return null;
	}
	return { interaction: submission, values: modal.read(submission) };
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

/**
 * The one modal a single field opens: titled after the field, carrying
 * `fields`, and read back into the shape every single-field caller shares.
 */
function createFieldModal<const M extends ModalFields>(
	labelKey: string,
	fields: M,
	translator: Translator,
	locale: Locale,
	toSubmission: (values: ModalValues<M>) => ReturnType<EditorFieldModal["read"]>,
): EditorFieldModal {
	const modal = createModal({
		id: EDITOR_FIELD_MODAL_ID,
		title: modalTitle(translator.translate(locale, labelKey), translator, locale),
		fields,
	});
	return {
		build: (state) => modal.build(state),
		read: (interaction) => toSubmission(modal.read(interaction)),
	};
}

/** Every field but the images: one optional text input, emptied to clear. */
function createTextModal<F extends string>(
	field: SettingsEditorValueField<F>,
	current: SettingsEditorFieldValue,
	translator: Translator,
	locale: Locale,
): EditorFieldModal {
	return createFieldModal(
		field.labelKey,
		{ value: valueFieldDefOf(field, current, translator, locale) },
		translator,
		locale,
		(values) => ({ value: values.value, upload: null, ids: null }),
	);
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
	return createFieldModal(
		field.labelKey,
		{
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
		translator,
		locale,
		(values) => ({ value: values.value, upload: values.upload?.[0] ?? null, ids: null }),
	);
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
	return createFieldModal(
		field.labelKey,
		{
			value: pickerFieldDef(
				field,
				pickerShared(field, translator, locale),
				current.picked,
				translator,
				locale,
			),
		},
		translator,
		locale,
		(values) => ({ value: null, upload: null, ids: values.value as readonly string[] | null }),
	);
}

/** The part of a picker component every kind of picker declares alike. */
interface PickerShared extends SelectBounds {
	label: string;
	required: boolean;
}

/**
 * What every picker component shares, whatever its own kind narrows it to —
 * used whether the field is prompted on its own or as a member of a group.
 */
function pickerShared<F extends string>(
	field: SettingsEditorPickerField<F>,
	translator: Translator,
	locale: Locale,
): PickerShared {
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
	shared: PickerShared,
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
					label: translator.translate(locale, choice.labelKey, choice.labelParams),
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
