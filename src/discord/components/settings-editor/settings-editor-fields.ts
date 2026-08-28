import type { ChannelType } from "discord.js";
import type { TextFieldStyleName } from "@/discord/interaction/modal";
import type { TranslationParams } from "@/i18n";

/**
 * How a field is entered.
 *
 * `image` is the only typed one that differs: it offers a file upload beside the
 * address box, because an administrator should not have to host a picture
 * somewhere before the bot will show it.
 *
 * `role`, `category`, `user`, `channel` and `choice` are picked rather than
 * typed — see {@link SettingsEditorPickerField}.
 */
export type SettingsEditorFieldKind =
	| "text"
	| "image"
	| "level"
	| "role"
	| "category"
	| "user"
	| "channel"
	| "choice";

/**
 * What every menu entry states, whatever picking it does.
 *
 * `hintKey` is required rather than optional on purpose: an entry the reader
 * cannot tell apart from its neighbours is the very problem these screens exist
 * to solve, so a declaration without one does not typecheck.
 */
interface SettingsEditorEntry<F extends string> {
	readonly key: F;
	readonly labelKey: string;
	/** Shown under the label in the menu — what this field controls, in one line. */
	readonly hintKey: string;
	/**
	 * The emoji a card layout's own button wears for this entry, in place of the
	 * generic one `mount-settings-editor.ts` would otherwise pick from the
	 * entry's own kind — a pencil for something edited, an arrow for a level
	 * descended into. Declared only where the generic would lie: an entry that
	 * opens a modal to *create* something reads wrong under a pencil, the icon
	 * for changing what already exists. Left undeclared, which is most entries,
	 * the generic stands exactly as it did before this existed.
	 */
	readonly icon?: string;
}

/**
 * An entry that goes somewhere rather than editing anything: picking it descends
 * into `levelKey`, and the return control comes back.
 *
 * It declares no modal geometry because it opens no modal — which the union
 * below enforces rather than leaving to a comment.
 */
export interface SettingsEditorLevelField<F extends string> extends SettingsEditorEntry<F> {
	readonly kind: "level";
	readonly levelKey: string;
}

/**
 * One editable field of a customisable embed: what it is called, what editing it
 * looks like, and what it is allowed to hold.
 *
 * Pure data, deliberately: both screens declare their fields as a constant list,
 * which is what lets the menu, the modal and the notices be built from one
 * declaration instead of three that have to agree.
 */
export interface SettingsEditorValueField<F extends string> extends SettingsEditorEntry<F> {
	readonly kind: "text" | "image";
	readonly style: TextFieldStyleName;
	/**
	 * Stops an over-long value at the client instead of rejecting it after the
	 * round trip. The domain parsers still enforce the real limit: this one is
	 * capped by what a modal input can carry at all.
	 */
	readonly maxLength: number;
	/**
	 * Replaces the generic "leave empty to clear" helper under the box, for a
	 * field whose empty case means something of its own.
	 */
	readonly helperKey?: string;
	/**
	 * The upload cap the helper text states, in MiB. Declared by the screen
	 * because the limit is the caller's own — the editor neither enforces it nor
	 * knows what is being stored.
	 */
	readonly uploadMaxMib?: number;
	/** Greyed-out example inside the box — the welcome message's token list. */
	readonly placeholderKey?: string;
	readonly placeholderParams?: TranslationParams;
}

/** What every picked entry states, whichever list it is picked from. */
interface SettingsEditorPickerEntry<F extends string> extends SettingsEditorEntry<F> {
	/** How many may be picked at once. One unless the screen says otherwise. */
	readonly maxValues?: number;
	/** Zero lets the picker clear the setting; one makes it mandatory. */
	readonly minValues?: number;
	/** Shown inside the picker before anything is chosen. */
	readonly pickerPlaceholderKey?: string;
}

/**
 * An entry picked from a list Discord populates itself — a role, a member, or a
 * category channel.
 *
 * `category` is the shorthand for the one channel shape a screen keeps asking
 * for; anything else states its own types through
 * {@link SettingsEditorChannelField}.
 */
export interface SettingsEditorEntityField<F extends string> extends SettingsEditorPickerEntry<F> {
	readonly kind: "role" | "category" | "user";
}

/** An entry picked from the guild's channels, narrowed to the types it names. */
export interface SettingsEditorChannelField<F extends string> extends SettingsEditorPickerEntry<F> {
	readonly kind: "channel";
	/**
	 * Required rather than optional: a channel picker offering every kind in the
	 * guild for a setting that only accepts one of them invites a choice the write
	 * then refuses.
	 */
	readonly channelTypes: readonly ChannelType[];
}

/** One option of a {@link SettingsEditorChoiceField}. */
export interface SettingsEditorChoice {
	/** What is stored — never shown, so it is not translated. */
	readonly value: string;
	readonly labelKey: string;
	/** Shown under the label, as a menu entry's hint is. Optional: a two-way toggle rarely needs one. */
	readonly descriptionKey?: string;
}

/**
 * An entry picked from a list the screen itself declares — a visibility mode, a
 * weekday.
 *
 * The command layer expresses these as `createStringOption().choices(...)`, and
 * a setting that had a closed set of values when it was a command still has one
 * once it moves behind a screen. Typing the value back into a modal would turn a
 * guaranteed-valid pick into a spelling test whose only feedback is a refusal.
 */
export interface SettingsEditorChoiceField<F extends string> extends SettingsEditorPickerEntry<F> {
	readonly kind: "choice";
	readonly choices: readonly SettingsEditorChoice[];
}

/**
 * An entry whose value is picked rather than typed.
 *
 * A modal carries text inputs only and cannot be changed once open, so a role, a
 * member, a channel or one of a closed set of values has to be chosen from a
 * component. Declaring the kind rather than wiring each picker by hand keeps the
 * one-declaration property: a field cannot appear in the menu with no way to
 * edit it.
 *
 * It states no modal geometry, for the same reason a level does not.
 */
export type SettingsEditorPickerField<F extends string> =
	| SettingsEditorEntityField<F>
	| SettingsEditorChannelField<F>
	| SettingsEditorChoiceField<F>;

/**
 * An entry that asks for several settings at once, in a single modal — a
 * tournament's announcement message, colour, image and footer, which read as
 * one decision rather than four.
 *
 * Its member fields are declared *inside* the group rather than as menu
 * entries of their own: that is what keeps the repository's "one declaration"
 * property — each member still owns the single `key` `currentValue` and the
 * write are named by, it is only the menu that no longer lists it separately.
 *
 * A level that reduces to a single group is not a level: per the rule this
 * repository already states for `COMMS_AREA_FIELDS` ("a domain that carries a
 * single setting *is* that setting, not a level"), a group replaces the level
 * outright rather than being offered as its lone entry.
 */
export interface SettingsEditorGroupField<F extends string> extends SettingsEditorEntry<F> {
	readonly kind: "group";
	/** The settings this modal asks for, in the order it poses them. */
	readonly fields: readonly (SettingsEditorValueField<F> | SettingsEditorPickerField<F>)[];
}

/**
 * A menu entry: either something to edit, or somewhere to go.
 *
 * Kept as one union so a level and a field are declared side by side in the same
 * list, in the order the menu offers them — the screen's shape is one constant,
 * not a field list plus a navigation table that could disagree about ordering.
 */
export type SettingsEditorField<F extends string> =
	| SettingsEditorValueField<F>
	| SettingsEditorPickerField<F>
	| SettingsEditorLevelField<F>
	| SettingsEditorGroupField<F>;

/** Whether this entry is typed — a text box or an image upload — rather than picked. */
export function isValueField<F extends string>(
	field: SettingsEditorField<F>,
): field is SettingsEditorValueField<F> {
	return field.kind === "text" || field.kind === "image";
}

/**
 * Whether this entry is picked from a list rather than typed.
 *
 * Both shapes open a modal; this only decides which geometry it opens with — a
 * role/user/channel select or a string select, prefilled from the current
 * selection, in place of a text input.
 */
export function isPickerField<F extends string>(
	field: SettingsEditorField<F>,
): field is SettingsEditorPickerField<F> {
	return (
		field.kind === "role" ||
		field.kind === "category" ||
		field.kind === "user" ||
		field.kind === "channel" ||
		field.kind === "choice"
	);
}

/** Whether this entry opens a modal asking for several settings at once. */
export function isGroupField<F extends string>(
	field: SettingsEditorField<F>,
): field is SettingsEditorGroupField<F> {
	return field.kind === "group";
}

/** The stored value of one field, as the modal editing it opens on. */
export interface SettingsEditorFieldValue {
	/** Prefills the text input; `null` when there is nothing to type back. */
	readonly text: string | null;
	/**
	 * Whether the field currently holds an upload. Discord cannot prefill a file
	 * input, so the modal says so in words instead of opening on a blank that
	 * reads like nothing being set.
	 */
	readonly uploaded: boolean;
	/** The identifiers a picker field currently carries. Empty for a field that is not picked. */
	readonly picked: readonly string[];
}

/** A text override, as the modal editing it opens on. */
export function textFieldValue(value: string | null): SettingsEditorFieldValue {
	return { text: value, uploaded: false, picked: [] };
}

/** A picker override, as the modal editing it opens on — prefilled from what it already holds. */
export function pickedFieldValue(ids: readonly string[]): SettingsEditorFieldValue {
	return { text: null, uploaded: false, picked: ids };
}

/** Discord's own cap on a modal text input, whatever the embed itself would take. */
export const MAX_MODAL_INPUT_LENGTH = 4000;

/**
 * Discord's own cap on a modal's top-level components: "between 1 and 5
 * (inclusive) components that make up the modal" (Discord's interaction
 * callback data reference). A group's member fields count against it one for
 * one — each becomes a `Label` — and so does the legend a group's modal may
 * carry, via a `TextDisplay`.
 */
export const MAX_MODAL_COMPONENTS = 5;

/** Whether a value picked from the menu is one of the fields a screen declared. */
export function isEditorField<F extends string>(
	fields: readonly SettingsEditorField<F>[],
	value: string,
): value is F {
	return fields.some((field) => field.key === value);
}

/** The declaration of one field, by key. */
export function editorField<F extends string>(
	fields: readonly SettingsEditorField<F>[],
	key: F,
): SettingsEditorField<F> {
	const found = fields.find((field) => field.key === key);
	if (found === undefined) {
		// Unreachable: a key only ever reaches here after `isEditorField` matched
		// it against this very list. Kept because nothing in the types ties the two
		// calls together.
		throw new Error(`No editable field declared under "${key}"`);
	}
	return found;
}
