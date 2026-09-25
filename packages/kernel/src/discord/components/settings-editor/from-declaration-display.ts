import { channelMention, roleMention, userMention } from "discord.js";
import type { DeclarationControl } from "@/discord/components/settings-editor/from-declaration-controls";
import {
	choiceLabelKey,
	isToggledOn,
	secretStateKey,
	storedIds,
} from "@/discord/components/settings-editor/from-declaration-stored";
import type { DeclarationSubject } from "@/discord/components/settings-editor/from-declaration-subject";
import { truncateText } from "@/discord/ui/truncate-text";
import type { TranslateKey } from "@/i18n/translator";
import { formatDuration } from "@/settings/duration";
import { SETTINGS_MESSAGES } from "@/settings/messages";

/** The most characters a stored text shows on the screen before it is cut. */
const MAX_TEXT_SHOWN = 100;

/** Separates the items of a list, and the toggles that are on. */
const ITEM_SEPARATOR = ", ";

/** One control's entry kind, which decides how a picked id reads. */
type EntryKind = DeclarationControl["entry"]["kind"];

/**
 * What a control currently holds, as the administrator reads it on the
 * screen: a channel, role or member as the Discord mention that renders its
 * name, an enum value or toggle as its translated label, a secret as whether
 * it is set (never its value), a duration formatted, anything else as is.
 * A stored id the guild no longer has reads as unavailable, a value left
 * unset as "not set".
 *
 * @param params.control - the control shown.
 * @param params.subject - the screen's current subject.
 * @param params.translate - translates the texts shown in place of a value.
 * @returns the text shown after the entry's "Current:" prefix.
 */
export function controlDisplay(params: {
	control: DeclarationControl;
	subject: DeclarationSubject;
	translate: TranslateKey;
}): string {
	const { control, subject, translate } = params;
	const value = subject.values[control.fieldKey];
	const { shape } = control;
	// A secret reads as whether it is set, whatever it holds: never its value.
	if ((value === undefined || value === null) && shape.kind !== "secret") {
		return translate(SETTINGS_MESSAGES.valueNotSet);
	}
	switch (shape.kind) {
		case "secret":
			return translate(secretStateKey(value));
		case "text":
			return truncateText(String(value), MAX_TEXT_SHOWN);
		case "number":
			return String(value);
		case "duration":
			return typeof value === "number" ? formatDuration(value) : String(value);
		case "lines":
			return Array.isArray(value)
				? truncateText(value.map(String).join(ITEM_SEPARATOR), MAX_TEXT_SHOWN)
				: String(value);
		case "boolean":
			return translate(
				value === true ? SETTINGS_MESSAGES.booleanTrue : SETTINGS_MESSAGES.booleanFalse,
			);
		case "single":
		case "many":
			return pickedDisplay({ control, subject, translate, value });
		case "toggles":
			return togglesDisplay({ control, translate, value, keys: shape.keys });
		default:
			return shape satisfies never;
	}
}

/** Each picked id or enum value as it reads, joined; "not set" for an empty list. */
function pickedDisplay(params: {
	control: DeclarationControl;
	subject: DeclarationSubject;
	translate: TranslateKey;
	value: unknown;
}): string {
	const { control, subject, translate, value } = params;
	const ids = storedIds(value);
	if (ids.length === 0) {
		return translate(SETTINGS_MESSAGES.valueNotSet);
	}
	const missing = subject.unavailable[control.fieldKey] ?? [];
	return ids
		.map((id) =>
			missing.includes(id)
				? translate(SETTINGS_MESSAGES.valueUnavailable)
				: pickedItem({ control, translate, id }),
		)
		.join(ITEM_SEPARATOR);
}

/** One picked id as a mention, or one enum value as its choice label. */
function pickedItem(params: {
	control: DeclarationControl;
	translate: TranslateKey;
	id: string;
}): string {
	const { control, translate, id } = params;
	const { entry } = control;
	const kind: EntryKind = entry.kind;
	switch (kind) {
		case "channel":
		case "category":
			return channelMention(id);
		case "role":
			return roleMention(id);
		case "user":
			return userMention(id);
		case "choice":
			return translatedChoice({ control, translate, value: id });
		case "text":
		case "image":
			return id;
		default:
			return kind satisfies never;
	}
}

/** The translated labels of this control's toggles that are on, or "none". */
function togglesDisplay(params: {
	control: DeclarationControl;
	translate: TranslateKey;
	value: unknown;
	keys: readonly string[];
}): string {
	const { control, translate, value, keys } = params;
	const on = keys.filter((key) => isToggledOn({ value, key }));
	if (on.length === 0) {
		return translate(SETTINGS_MESSAGES.valueNone);
	}
	return on.map((key) => translatedChoice({ control, translate, value: key })).join(ITEM_SEPARATOR);
}

/** A choice control's value as its translated label, or the value itself when no choice offers it. */
function translatedChoice(params: {
	control: DeclarationControl;
	translate: TranslateKey;
	value: string;
}): string {
	const { control, translate, value } = params;
	const { entry } = control;
	const labelKey =
		entry.kind === "choice" ? choiceLabelKey({ choices: entry.choices, value }) : undefined;
	return labelKey === undefined ? value : translate(labelKey);
}
