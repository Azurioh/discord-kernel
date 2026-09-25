import { ValidationError } from "@/errors/business-error";
import type { SettingsDeclaration } from "@/settings/define-settings";
import {
	type AnyField,
	type DynamicSuggestions,
	type FieldSpec,
	type Suggestions,
	unhandledFieldKind,
} from "@/settings/fields/field";
import { type FieldValueIssue, parseFieldValue } from "@/settings/fields/zod-schema";
import { isPlainObject } from "@/settings/is-plain-object";
import { SETTINGS_ISSUE_MESSAGES } from "@/settings/messages";
import type { GuildDirectory } from "@/settings/ports/guild-directory";
import type { SettingsIssue, SettingsIssueCode } from "@/settings/settings-validation-error";
import { dynamicLabel, type SuggestionPorts } from "@/settings/suggest";

/**
 * Outcome of {@link validateSettings}: the submitted fields in their stored
 * form, or every issue found. A field submitted as `null` or `undefined` is
 * unset: it appears in `values` with the value `undefined`.
 */
export type SettingsValidation =
	| { readonly ok: true; readonly values: Readonly<Record<string, unknown>> }
	| { readonly ok: false; readonly issues: readonly SettingsIssue[] };

interface EntryOutcome {
	readonly value: unknown;
	readonly issues: readonly SettingsIssue[];
}

/** A field value checked on its own (stage 1), before the guild and strict checks. */
type ParsedEntry =
	| {
			readonly ok: true;
			readonly key: string;
			readonly declared: AnyField;
			readonly value: unknown;
	  }
	| { readonly ok: false; readonly outcome: EntryOutcome };

/**
 * Who submits and what stage 2 reads: the guild's directory, the ports a
 * strict field's search runs with, the requester, and the guild's current
 * values, read only when a strict search needs them.
 */
export interface ValidationScope {
	readonly ports: SuggestionPorts;
	readonly guildId: string;
	readonly userId: string;
	readonly locale: string;
	/** The guild's current values as a surface reads them (secrets as whether they are set). */
	readonly currentValues: () => Promise<Readonly<Record<string, unknown>>>;
}

/**
 * Validate a settings submission against its declaration, in two stages.
 * Stage 1 checks each submitted field on its own (kind, bounds, lengths, list
 * size, duplicates, enum membership, required fields being unset). Stage 2 runs
 * only on the fields that passed stage 1: it asks the guild directory whether
 * each referenced channel, role and member exists, and whether a channel is of
 * an allowed type; and it asks a strict field's search whether it knows the
 * value (FR-023): `label(value)` must name it, or, without `label`, a result
 * of `resolve(String(value))` must hold exactly that value. A strict search
 * that runs past its budget or fails knows nothing (logged): the value is
 * refused as `unknownChoice` rather than stored unchecked. Keys the
 * declaration lacks are rejected.
 *
 * @param params.declaration - the module's settings declaration.
 * @param params.patch - the submitted fields, keyed by field key; any value.
 * @param params.scope - the guild, the requester and the ports stage 2 reads.
 * @returns the stored form of every submitted field, or every issue found, in
 * submission order, with catalog keys from {@link SETTINGS_ISSUE_MESSAGES}.
 * @throws ValidationError when the patch is not a plain object (a malformed
 * request, not an invalid value).
 */
export async function validateSettings(params: {
	declaration: SettingsDeclaration;
	patch: unknown;
	scope: ValidationScope;
}): Promise<SettingsValidation> {
	const { declaration, patch, scope } = params;
	if (!isPlainObject(patch)) {
		throw new ValidationError(
			`Settings patch for module "${declaration.id}" must be an object keyed by field`,
		);
	}
	const entries = Object.entries(patch);
	const parsed = entries.map(([key, value]) => parseEntry({ declaration, key, value }));
	// A secret stays out of what a search sees, as it stays out of every surface read.
	const submitted = Object.fromEntries(
		parsed.flatMap((entry) =>
			entry.ok && entry.declared.spec.kind !== "secret" ? [[entry.key, entry.value]] : [],
		),
	);
	const values = lazyValues({ scope, submitted });
	const outcomes = await Promise.all(
		parsed.map((entry) =>
			entry.ok ? checkEntry({ scope, declaration, entry, values }) : entry.outcome,
		),
	);
	const issues = outcomes.flatMap((entry) => entry.issues);
	if (issues.length > 0) {
		return { ok: false, issues };
	}
	return {
		ok: true,
		values: Object.fromEntries(entries.map(([key], index) => [key, outcomes[index]?.value])),
	};
}

/**
 * The values a strict search sees as "currently entered": the guild's current
 * values with the submitted ones over them. Read once, and only when a strict
 * search asks.
 */
function lazyValues(params: {
	scope: ValidationScope;
	submitted: Readonly<Record<string, unknown>>;
}): () => Promise<Readonly<Record<string, unknown>>> {
	let values: Promise<Readonly<Record<string, unknown>>> | undefined;
	return () => {
		values ??= params.scope
			.currentValues()
			.then((current) => ({ ...current, ...params.submitted }));
		return values;
	};
}

/** Stage 1: one submitted field checked on its own. */
function parseEntry(params: {
	declaration: SettingsDeclaration;
	key: string;
	value: unknown;
}): ParsedEntry {
	const { declaration, key, value } = params;
	const declared = Object.hasOwn(declaration.fields, key) ? declaration.fields[key] : undefined;
	if (declared === undefined) {
		return failed({ key, issues: [{ path: [], code: "unknownField", params: {} }] });
	}
	if (value === null || value === undefined) {
		if (declared.required && declared.default === undefined) {
			return failed({ key, issues: [{ path: [], code: "required", params: {} }] });
		}
		return { ok: true, key, declared, value: undefined };
	}
	const parsed = parseFieldValue({ field: declared, value });
	if (!parsed.ok) {
		return failed({ key, issues: parsed.issues });
	}
	return { ok: true, key, declared, value: parsed.value };
}

function failed(params: { key: string; issues: readonly FieldValueIssue[] }): ParsedEntry {
	return { ok: false, outcome: outcome(params) };
}

/** What stage 2 checks one field that passed stage 1 with. */
interface EntryCheck {
	readonly scope: ValidationScope;
	readonly declaration: SettingsDeclaration;
	readonly entry: Extract<ParsedEntry, { ok: true }>;
	/** The values a strict search sees, read on first use. */
	readonly values: () => Promise<Readonly<Record<string, unknown>>>;
}

/** One value of that field to check: the field's own, or one list item and the item's spec. */
interface ValueCheck extends EntryCheck {
	readonly spec: FieldSpec;
	readonly value: unknown;
}

/** Stage 2 on a field that passed stage 1; an unset field has nothing to check. */
async function checkEntry(params: EntryCheck): Promise<EntryOutcome> {
	const { entry } = params;
	if (entry.value === undefined) {
		return { value: undefined, issues: [] };
	}
	const issues = await checkReferences({
		...params,
		spec: entry.declared.spec,
		value: entry.value,
	});
	return outcome({ key: entry.key, issues, value: entry.value });
}

function outcome(params: {
	key: string;
	issues: readonly FieldValueIssue[];
	value?: unknown;
}): EntryOutcome {
	const { key, issues, value } = params;
	return { value, issues: issues.map((issue) => toSettingsIssue(key, issue)) };
}

/** Stage 2 on a value, item by item for a list. */
async function checkReferences(params: ValueCheck): Promise<FieldValueIssue[]> {
	const { spec, value } = params;
	if (spec.kind === "list" && Array.isArray(value)) {
		const codes = await Promise.all(
			value.map((item: unknown) => checkValue({ ...params, spec: spec.item.spec, value: item })),
		);
		return codes.flatMap((code, index) =>
			code === undefined ? [] : [{ path: [index], code, params: {} }],
		);
	}
	const code = await checkValue(params);
	return code === undefined ? [] : [{ path: [], code, params: {} }];
}

/** The guild check, or the strict check, one value needs; `undefined` when it passes. */
async function checkValue(params: ValueCheck): Promise<SettingsIssueCode | undefined> {
	const { scope, declaration, entry, values, spec, value } = params;
	if ((spec.kind === "text" || spec.kind === "integer") && isStrictSearch(spec.suggest)) {
		const label = await dynamicLabel({
			scope: {
				...scope.ports,
				moduleId: declaration.id,
				key: entry.key,
				ctx: {
					guildId: scope.guildId,
					userId: scope.userId,
					locale: scope.locale,
					values: withoutKey(await values(), entry.key),
				},
			},
			suggest: spec.suggest,
			value,
		});
		return label === undefined ? "unknownChoice" : undefined;
	}
	return checkEntity({ guilds: scope.ports.guilds, guildId: scope.guildId, spec, value });
}

/** Whether a field's suggestions are a search that must know every value written. */
function isStrictSearch(
	suggest: Suggestions<string> | Suggestions<number> | undefined,
): suggest is DynamicSuggestions<string> | DynamicSuggestions<number> {
	return suggest !== undefined && !("choices" in suggest) && suggest.strict === true;
}

/** The other values: a search is told what else is entered, not its own field's value. */
function withoutKey(
	values: Readonly<Record<string, unknown>>,
	key: string,
): Readonly<Record<string, unknown>> {
	const { [key]: _own, ...others } = values;
	return others;
}

/**
 * Whether the channel, role or member a value references is usable on the
 * guild. Stage 1 makes such a value a snowflake string; any other value
 * references no guild entity and needs no check.
 */
async function checkEntity(params: {
	guilds: GuildDirectory;
	guildId: string;
	spec: FieldSpec;
	value: unknown;
}): Promise<SettingsIssueCode | undefined> {
	const { guilds, guildId, spec, value } = params;
	if (typeof value !== "string") {
		return undefined;
	}
	switch (spec.kind) {
		case "channel": {
			const channel = await guilds.channel(guildId, value);
			if (channel === null) {
				return "notFound";
			}
			if (spec.types !== undefined && !spec.types.includes(channel.kind)) {
				return "channelType";
			}
			return undefined;
		}
		case "role":
			return (await guilds.role(guildId, value)) === null ? "notFound" : undefined;
		case "user":
			return (await guilds.member(guildId, value)) === null ? "notFound" : undefined;
		case "color":
		case "duration":
		case "enum":
		case "integer":
		case "number":
		case "text":
		case "boolean":
		case "secret":
		case "list":
		case "toggles":
			return undefined;
		default:
			return unhandledFieldKind(spec);
	}
}

/** `[i]` for a list index, `.name` for a toggle key. */
function pathSuffix(segment: number | string): string {
	return typeof segment === "number" ? `[${segment}]` : `.${segment}`;
}

function toSettingsIssue(key: string, issue: FieldValueIssue): SettingsIssue {
	const translationKey = SETTINGS_ISSUE_MESSAGES[issue.code];
	const field = `${key}${issue.path.map(pathSuffix).join("")}`;
	const translation =
		Object.keys(issue.params).length === 0
			? { key: translationKey }
			: { key: translationKey, params: issue.params };
	return { field, code: issue.code, translation };
}
