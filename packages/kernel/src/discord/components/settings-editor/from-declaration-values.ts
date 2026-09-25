import type {
	ControlShape,
	DeclarationControl,
} from "@/discord/components/settings-editor/from-declaration-controls";
import type { DeclarationSubject } from "@/discord/components/settings-editor/from-declaration-subject";
import type { SettingsEditorGroupMemberSubmission } from "@/discord/components/settings-editor/settings-editor-field-modal";
import {
	isPickerField,
	pickedFieldValue,
	type SettingsEditorFieldValue,
	textFieldValue,
} from "@/discord/components/settings-editor/settings-editor-fields";
import { formatDuration } from "@/settings/duration";
import { SETTINGS_MESSAGES } from "@/settings/messages";

/** Translates a catalog key into the administrator's language. */
export type TranslateKey = (key: string) => string;

/** A decimal number as typed: optional sign, digits with an optional fraction, optional exponent. */
const DECIMAL_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** Separates the items of a list typed one per line. */
const LINE_BREAK = /\r?\n/;

/**
 * What the modal of a control opens on: the stored value as text for a typed
 * control, whether a secret is set (never its value), the picked ids for a
 * picker, minus the entities the guild no longer has, which the text then
 * reports as unavailable.
 *
 * @param params.control - the control being opened.
 * @param params.subject - the screen's current subject.
 * @param params.translate - translates the texts shown in place of a value.
 * @returns the control's prefill.
 */
export function controlValue(params: {
	control: DeclarationControl;
	subject: DeclarationSubject;
	translate: TranslateKey;
}): SettingsEditorFieldValue {
	const { control, subject, translate } = params;
	const value = subject.values[control.fieldKey];
	const { shape } = control;
	switch (shape.kind) {
		case "text":
			return textFieldValue(typeof value === "string" ? value : null);
		case "number":
			return textFieldValue(typeof value === "number" ? String(value) : null);
		case "duration":
			return textFieldValue(typeof value === "number" ? formatDuration(value) : null);
		case "secret":
			return textFieldValue(translate(secretStateKey(value)));
		case "lines":
			return textFieldValue(Array.isArray(value) && value.length > 0 ? value.join("\n") : null);
		case "boolean":
			return pickedFieldValue(typeof value === "boolean" ? [String(value)] : []);
		case "single":
		case "many":
			return pickedValue({ control, subject, translate });
		case "toggles":
			return pickedFieldValue(shape.keys.filter((key) => isToggledOn({ value, key })));
		default:
			return shape satisfies never;
	}
}

/** `set` for a secret the surface reads as set, `not set` otherwise. */
export function secretStateKey(value: unknown): string {
	const isSet = typeof value === "object" && value !== null && "isSet" in value && value.isSet;
	return isSet === true ? SETTINGS_MESSAGES.secretSet : SETTINGS_MESSAGES.secretNotSet;
}

/** Whether `key` is on in a toggles value. */
export function isToggledOn(params: { value: unknown; key: string }): boolean {
	const { value, key } = params;
	return typeof value === "object" && value !== null && Reflect.get(value, key) === true;
}

/** The picked ids the guild still has, with a notice when any stored one is gone. */
function pickedValue(params: {
	control: DeclarationControl;
	subject: DeclarationSubject;
	translate: TranslateKey;
}): SettingsEditorFieldValue {
	const { control, subject, translate } = params;
	const value = subject.values[control.fieldKey];
	const stored = Array.isArray(value) ? value.map(String) : storedSingle(value);
	const missing = subject.unavailable[control.fieldKey] ?? [];
	const picked = pickedFieldValue(stored.filter((id) => !missing.includes(id)));
	if (missing.length === 0) {
		return picked;
	}
	return { ...picked, text: translate(SETTINGS_MESSAGES.valueUnavailable) };
}

function storedSingle(value: unknown): string[] {
	return typeof value === "string" ? [value] : [];
}

/**
 * Whether a submission leaves a control as its modal opened: the same picked
 * ids in the same order for a picker (whatever notice its text carries), the
 * same text for a typed control (an empty box and no value alike).
 *
 * @param params.control - the control submitted.
 * @param params.submission - what it came back with.
 * @param params.current - what its modal opened on.
 * @returns `true` when nothing was changed.
 */
export function isUnchanged(params: {
	control: DeclarationControl;
	submission: SettingsEditorGroupMemberSubmission;
	current: SettingsEditorFieldValue;
}): boolean {
	const { control, submission, current } = params;
	if (isPickerField(control.entry)) {
		const ids = submission.ids ?? [];
		return (
			ids.length === current.picked.length && ids.every((id, index) => current.picked[index] === id)
		);
	}
	return (submission.value ?? "") === (current.text ?? "");
}

/**
 * Add what one control submitted to a settings patch, in the form the
 * settings service takes: typed text converted to the value it denotes and
 * left as text when it denotes none (the service then refuses it with the same
 * issue as any surface), `null` for a cleared control, and a toggles select
 * merged into the full record of its field.
 *
 * @param params.control - the control submitted.
 * @param params.submission - what it came back with.
 * @param params.subject - the screen's current subject, for the toggles the
 * select does not show.
 * @param params.patch - the patch built so far.
 * @returns the patch with the control's value.
 */
export function withSubmission(params: {
	control: DeclarationControl;
	submission: SettingsEditorGroupMemberSubmission;
	subject: DeclarationSubject;
	patch: Readonly<Record<string, unknown>>;
}): Readonly<Record<string, unknown>> {
	const { control, submission, subject, patch } = params;
	const { fieldKey, shape } = control;
	const current = Object.hasOwn(patch, fieldKey) ? patch[fieldKey] : subject.values[fieldKey];
	return { ...patch, [fieldKey]: submittedValue({ shape, submission, current }) };
}

/** What one control submitted, as the settings service takes it; `current` is its field's value so far. */
function submittedValue(params: {
	shape: ControlShape;
	submission: SettingsEditorGroupMemberSubmission;
	current: unknown;
}): unknown {
	const { shape, submission } = params;
	const { value, ids } = submission;
	switch (shape.kind) {
		case "text":
		case "duration":
		case "secret":
			return value;
		case "number":
			return value === null ? null : typedNumber(value);
		case "lines":
			return value === null ? null : typedLines({ text: value, numeric: shape.numeric });
		case "boolean":
			return ids === null || ids.length === 0 ? null : pickedBoolean(ids[0]);
		case "single":
			return ids === null || ids.length === 0 ? null : singleId(ids);
		case "many":
			return ids === null ? null : [...ids];
		case "toggles":
			return { ...toggleRecord(params.current), ...pickedToggles({ keys: shape.keys, ids }) };
		default:
			return shape satisfies never;
	}
}

/** A toggles value as a record, or an empty one when the field holds none. */
function toggleRecord(value: unknown): Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null ? { ...value } : {};
}

/** Each key of one toggles select, on when picked. */
function pickedToggles(params: {
	keys: readonly string[];
	ids: readonly string[] | null;
}): Record<string, boolean> {
	const picked = params.ids ?? [];
	// A picked id the select does not offer is kept, for the service to refuse.
	const keys = [...params.keys, ...picked.filter((id) => !params.keys.includes(id))];
	return Object.fromEntries(keys.map((key) => [key, picked.includes(key)]));
}

/** The number typed, or the text itself when it is not one. */
function typedNumber(text: string): number | string {
	const trimmed = text.trim();
	return DECIMAL_PATTERN.test(trimmed) ? Number(trimmed) : text;
}

/** Each non-empty trimmed line as one item; `null` when no line holds one. */
function typedLines(params: { text: string; numeric: boolean }): unknown[] | null {
	const lines = params.text
		.split(LINE_BREAK)
		.map((line) => line.trim())
		.filter((line) => line !== "");
	if (lines.length === 0) {
		return null;
	}
	return params.numeric ? lines.map(typedNumber) : lines;
}

/** `true` and `false` from their options; any other id is left for the service to refuse. */
function pickedBoolean(id: string | undefined): boolean | string | undefined {
	if (id === String(true)) {
		return true;
	}
	if (id === String(false)) {
		return false;
	}
	return id;
}

/** The one id a single picker took; several are left as a list for the service to refuse. */
function singleId(ids: readonly string[]): string | readonly string[] {
	return ids.length === 1 && ids[0] !== undefined ? ids[0] : ids;
}
