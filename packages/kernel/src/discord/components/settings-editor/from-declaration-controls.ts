import type { ChannelType } from "discord.js";
import { MAX_SELECT_OPTIONS } from "@/discord/components/settings-editor/settings-editor.view";
import {
	MAX_MODAL_INPUT_LENGTH,
	type SettingsEditorChoice,
	type SettingsEditorGroupField,
} from "@/discord/components/settings-editor/settings-editor-fields";
import { SETTINGS_EDITOR_MESSAGES } from "@/discord/i18n";
import { CHANNEL_TYPE_BY_KIND } from "@/discord/settings/discord-guild-directory";
import type { SettingsDeclaration } from "@/settings/define-settings";
import {
	type AnyField,
	FIELD_LIMITS,
	type FieldSpec,
	unhandledFieldKind,
} from "@/settings/fields/field";
import { SETTINGS_MESSAGES } from "@/settings/messages";
import type { ChannelKind } from "@/settings/ports/guild-directory";
import { SettingsDeclarationError } from "@/settings/settings-declaration-error";

/** One editable entry of the screen: a typed box or a picker, never a level or a group. */
type ControlEntry = SettingsEditorGroupField<string>["fields"][number];

/**
 * How a control's value moves between the stored settings and the screen:
 * - `text`: a string typed as is (text, colour);
 * - `number`: a number typed as its decimal text (integer, number);
 * - `duration`: whole seconds typed as `1h30m`;
 * - `secret`: typed, prefilled with whether it is set, never with its value;
 * - `lines`: a list of integers or texts typed one item per line;
 * - `boolean`: picked from a yes/no choice;
 * - `single`: one picked id or enum value;
 * - `many`: a list of picked ids or enum values;
 * - `toggles`: the keys of one toggles select that are on (`keys` are that
 *   select's own, at most {@link MAX_SELECT_OPTIONS}).
 */
export type ControlShape =
	| { readonly kind: "text" | "number" | "duration" | "secret" | "boolean" | "single" | "many" }
	| { readonly kind: "lines"; readonly numeric: boolean }
	| { readonly kind: "toggles"; readonly keys: readonly string[] };

/** One control of the screen and the declared field it edits. */
export interface DeclarationControl {
	readonly entry: ControlEntry;
	/** Key of the declared field; a toggles field split over several selects shares it. */
	readonly fieldKey: string;
	/** Id of the declared group the field belongs to, if any. */
	readonly groupId: string | undefined;
	readonly shape: ControlShape;
}

type TogglesSpec = Extract<FieldSpec, { readonly kind: "toggles" }>;

/** Separates a split toggles field's key from the number of its select. */
const CHUNK_SEPARATOR = "#";

/** What every entry of one declared field states, whatever its control. */
interface EntryBase {
	readonly key: string;
	readonly labelKey: string;
	readonly hintKey: string;
}

/**
 * The controls of a declaration, in declared order: one per field, except a
 * toggles field with more keys than a select offers, which gets one control
 * per chunk of at most {@link MAX_SELECT_OPTIONS} keys.
 *
 * @param declaration - the module's settings declaration.
 * @returns every control of the screen.
 * @throws SettingsDeclarationError when a list holds an item kind lists cannot
 * hold, which only a declaration built without `defineSettings` can do.
 */
export function declarationControls(declaration: SettingsDeclaration): DeclarationControl[] {
	return Object.entries(declaration.fields).flatMap(([fieldKey, declared]) =>
		fieldControls({ declarationId: declaration.id, fieldKey, declared }),
	);
}

function fieldControls(params: {
	declarationId: string;
	fieldKey: string;
	declared: AnyField;
}): DeclarationControl[] {
	const { fieldKey, declared } = params;
	const groupId = declared.ui?.group;
	const base: EntryBase = {
		key: fieldKey,
		labelKey: declared.label ?? fieldKey,
		hintKey: declared.description ?? SETTINGS_EDITOR_MESSAGES.entryHint,
	};
	const { spec } = declared;
	if (spec.kind === "toggles") {
		return togglesControls({ base, groupId, spec });
	}
	const single = singleControl({ ...params, base, spec });
	return [{ ...single, fieldKey, groupId }];
}

/** The entry and shape of a field that is not a toggles field. */
function singleControl(params: {
	declarationId: string;
	fieldKey: string;
	declared: AnyField;
	base: EntryBase;
	spec: Exclude<FieldSpec, TogglesSpec>;
}): Pick<DeclarationControl, "entry" | "shape"> {
	const { base, spec, declared } = params;
	switch (spec.kind) {
		case "text":
			return {
				entry: typedEntry({
					base,
					declared,
					style: "paragraph",
					maxLength: spec.maxLength ?? FIELD_LIMITS.textMaxLength,
				}),
				shape: { kind: "text" },
			};
		case "color":
			return { entry: typedEntry({ base, declared, style: "short" }), shape: { kind: "text" } };
		case "integer":
		case "number":
			return { entry: typedEntry({ base, declared, style: "short" }), shape: { kind: "number" } };
		case "duration":
			return { entry: typedEntry({ base, declared, style: "short" }), shape: { kind: "duration" } };
		case "secret":
			return { entry: typedEntry({ base, declared, style: "short" }), shape: { kind: "secret" } };
		case "boolean":
			return {
				entry: { ...base, kind: "choice", minValues: 0, maxValues: 1, choices: BOOLEAN_CHOICES },
				shape: { kind: "boolean" },
			};
		case "enum":
		case "channel":
		case "role":
		case "user":
			return {
				entry: pickerEntry({ base, spec, bounds: { minValues: 0, maxValues: 1 } }),
				shape: { kind: "single" },
			};
		case "list":
			return listControl({ ...params, spec });
		default:
			return unhandledFieldKind(spec);
	}
}

/** The two options of a yes/no field, stored as `"true"` and `"false"`. */
const BOOLEAN_CHOICES: readonly SettingsEditorChoice[] = [
	{ value: String(true), labelKey: SETTINGS_MESSAGES.booleanTrue },
	{ value: String(false), labelKey: SETTINGS_MESSAGES.booleanFalse },
];

function typedEntry(params: {
	base: EntryBase;
	declared: AnyField;
	style: "short" | "paragraph";
	maxLength?: number;
}): ControlEntry {
	const { base, declared, style } = params;
	const placeholder =
		declared.placeholder === undefined ? {} : { placeholderKey: declared.placeholder };
	return {
		...base,
		kind: "text",
		style,
		maxLength: params.maxLength ?? MAX_MODAL_INPUT_LENGTH,
		...placeholder,
	};
}

/** How many values a picker takes. */
interface PickerBounds {
	readonly minValues: number;
	readonly maxValues: number;
}

/** The spec of a value picked from a list: a channel, a role, a member or an enum value. */
type PickableSpec = Extract<FieldSpec, { readonly kind: "enum" | "channel" | "role" | "user" }>;

function isPickable(spec: FieldSpec): spec is PickableSpec {
	return (
		spec.kind === "enum" || spec.kind === "channel" || spec.kind === "role" || spec.kind === "user"
	);
}

/** A picker for one channel, role, user or enum value, or a list of them. */
function pickerEntry(params: {
	base: EntryBase;
	spec: PickableSpec;
	bounds: PickerBounds;
}): ControlEntry {
	const { base, spec, bounds } = params;
	switch (spec.kind) {
		case "enum":
			return {
				...base,
				...bounds,
				kind: "choice",
				choices: spec.choices.map((choice) => ({ value: choice.value, labelKey: choice.label })),
			};
		case "channel":
			return { ...base, ...bounds, ...channelPicker(spec.types) };
		case "role":
		case "user":
			return { ...base, ...bounds, kind: spec.kind };
		default:
			return unhandledFieldKind(spec);
	}
}

/** Every guild channel type, for a channel field that restricts none. */
const EVERY_CHANNEL_TYPE: readonly ChannelType[] = Object.values(CHANNEL_TYPE_BY_KIND);

/** A category picker when the field takes categories only, a channel picker otherwise. */
function channelPicker(
	types: readonly ChannelKind[] | undefined,
):
	| { readonly kind: "category" }
	| { readonly kind: "channel"; readonly channelTypes: readonly ChannelType[] } {
	if (types !== undefined && types.length > 0 && types.every(isCategory)) {
		return { kind: "category" };
	}
	return {
		kind: "channel",
		channelTypes: types === undefined ? EVERY_CHANNEL_TYPE : types.map(toChannelType),
	};
}

function isCategory(kind: ChannelKind): boolean {
	return kind === "category";
}

function toChannelType(kind: ChannelKind): ChannelType {
	return CHANNEL_TYPE_BY_KIND[kind];
}

/**
 * A list of pickable items becomes a picker bounded by the list's sizes; a
 * list of integers or texts, which no picker offers, a box taking one item
 * per line.
 */
function listControl(params: {
	declarationId: string;
	fieldKey: string;
	declared: AnyField;
	base: EntryBase;
	spec: Extract<FieldSpec, { readonly kind: "list" }>;
}): Pick<DeclarationControl, "entry" | "shape"> {
	const { base, spec, declared } = params;
	const itemKind = spec.item.spec.kind;
	if (itemKind === "integer" || itemKind === "text") {
		return {
			entry: typedEntry({ base, declared, style: "paragraph" }),
			shape: { kind: "lines", numeric: itemKind === "integer" },
		};
	}
	const itemSpec = spec.item.spec;
	if (!isPickable(itemSpec)) {
		throw new SettingsDeclarationError(
			params.declarationId,
			`field "${params.fieldKey}" is a list of ${itemKind}, which lists cannot hold`,
		);
	}
	const bounds: PickerBounds = {
		minValues: spec.minItems ?? 0,
		maxValues: spec.maxItems ?? FIELD_LIMITS.listMaxItems,
	};
	return { entry: pickerEntry({ base, spec: itemSpec, bounds }), shape: { kind: "many" } };
}

/**
 * A toggles field as selects of at most {@link MAX_SELECT_OPTIONS} keys each,
 * every key labelled with its `keyLabels` entry. A single select keeps the
 * field's key; split ones number theirs.
 */
function togglesControls(params: {
	base: EntryBase;
	groupId: string | undefined;
	spec: TogglesSpec;
}): DeclarationControl[] {
	const { base, groupId, spec } = params;
	const chunks = chunked(spec.keys, MAX_SELECT_OPTIONS);
	return chunks.map((keys, index) => ({
		entry: {
			...base,
			key: chunks.length === 1 ? base.key : `${base.key}${CHUNK_SEPARATOR}${index + 1}`,
			kind: "choice",
			minValues: 0,
			maxValues: keys.length,
			choices: keys.map((key) => ({ value: key, labelKey: spec.keyLabels?.[key] ?? key })),
		},
		fieldKey: base.key,
		groupId,
		shape: { kind: "toggles", keys },
	}));
}

/**
 * `items` in consecutive chunks of at most `size`, in order.
 *
 * @param items - the items to split.
 * @param size - the most items one chunk holds.
 * @returns the chunks; none for no items.
 */
export function chunked<T>(items: readonly T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let start = 0; start < items.length; start += size) {
		chunks.push(items.slice(start, start + size));
	}
	return chunks;
}
