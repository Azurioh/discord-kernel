import { ValidationError } from "@/errors/business-error";
import type { SettingsDeclaration } from "@/settings/define-settings";
import { type FieldSpec, type FieldValueIssue, parseFieldValue } from "@/settings/fields";
import { SETTINGS_ISSUE_MESSAGES } from "@/settings/messages";
import type { GuildDirectory } from "@/settings/ports/guild-directory";
import type { SettingsIssue, SettingsIssueCode } from "@/settings/settings-validation-error";

/**
 * Outcome of {@link validateSettings}: the submitted fields in their stored
 * form, or every issue found. A field submitted as `null` or `undefined` is
 * unset: it appears in `values` with the value `undefined`.
 */
export type SettingsValidation =
	| { readonly ok: true; readonly values: Readonly<Record<string, unknown>> }
	| { readonly ok: false; readonly issues: readonly SettingsIssue[] };

/** Where a submission is checked: its guild and the directory of that guild. */
interface GuildScope {
	readonly guildId: string;
	readonly guilds: GuildDirectory;
}

interface EntryOutcome {
	readonly value: unknown;
	readonly issues: readonly SettingsIssue[];
}

/**
 * Validate a settings submission against its declaration, in two stages.
 * Stage 1 checks each submitted field on its own (kind, bounds, lengths, list
 * size, duplicates, enum membership, required fields being unset). Stage 2 runs
 * only on the fields that passed stage 1 and asks the guild directory whether
 * each referenced channel, role and member exists, and whether a channel is of
 * an allowed type. Keys the declaration lacks are rejected.
 *
 * @param params.declaration - the module's settings declaration.
 * @param params.guildId - the guild the submission is for.
 * @param params.patch - the submitted fields, keyed by field key; any value.
 * @param params.guilds - the directory stage 2 checks guild entities against.
 * @returns the stored form of every submitted field, or every issue found, in
 * submission order, with catalog keys from {@link SETTINGS_ISSUE_MESSAGES}.
 * @throws ValidationError when the patch is not a plain object (a malformed
 * request, not an invalid value).
 */
export async function validateSettings(params: {
	declaration: SettingsDeclaration;
	guildId: string;
	patch: unknown;
	guilds: GuildDirectory;
}): Promise<SettingsValidation> {
	const { declaration, patch } = params;
	if (!isRecord(patch)) {
		throw new ValidationError(
			`Settings patch for module "${declaration.id}" must be an object keyed by field`,
		);
	}
	const entries = Object.entries(patch);
	const outcomes = await Promise.all(
		entries.map(([key, value]) => validateEntry({ scope: params, declaration, key, value })),
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function validateEntry(params: {
	scope: GuildScope;
	declaration: SettingsDeclaration;
	key: string;
	value: unknown;
}): Promise<EntryOutcome> {
	const { scope, declaration, key, value } = params;
	const declared = Object.hasOwn(declaration.fields, key) ? declaration.fields[key] : undefined;
	if (declared === undefined) {
		return outcome({ key, issues: [{ path: [], code: "unknownField", params: {} }] });
	}
	if (value === null || value === undefined) {
		if (declared.required && declared.default === undefined) {
			return outcome({ key, issues: [{ path: [], code: "required", params: {} }] });
		}
		return { value: undefined, issues: [] };
	}
	const parsed = parseFieldValue({ field: declared, value });
	if (!parsed.ok) {
		return outcome({ key, issues: parsed.issues });
	}
	const guildIssues = await checkGuildEntities({ scope, spec: declared.spec, value: parsed.value });
	return outcome({ key, issues: guildIssues, value: parsed.value });
}

function outcome(params: {
	key: string;
	issues: readonly FieldValueIssue[];
	value?: unknown;
}): EntryOutcome {
	const { key, issues, value } = params;
	return { value, issues: issues.map((issue) => toSettingsIssue(key, issue)) };
}

/** Stage 2: guild checks on a value that passed its field's own validation. */
async function checkGuildEntities(params: {
	scope: GuildScope;
	spec: FieldSpec;
	value: unknown;
}): Promise<FieldValueIssue[]> {
	const { scope, spec, value } = params;
	if (spec.kind === "list" && Array.isArray(value)) {
		const codes = await Promise.all(
			value.map((item: unknown) => checkEntity({ scope, spec: spec.item.spec, value: item })),
		);
		return codes.flatMap((code, index) =>
			code === undefined ? [] : [{ path: [index], code, params: {} }],
		);
	}
	const code = await checkEntity({ scope, spec, value });
	return code === undefined ? [] : [{ path: [], code, params: {} }];
}

/**
 * Whether the channel, role or member a value references is usable on the
 * guild. Stage 1 makes such a value a snowflake string; any other value
 * references no guild entity and needs no check.
 */
async function checkEntity(params: {
	scope: GuildScope;
	spec: FieldSpec;
	value: unknown;
}): Promise<SettingsIssueCode | undefined> {
	const { scope, spec, value } = params;
	if (typeof value !== "string") {
		return undefined;
	}
	const { guilds, guildId } = scope;
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
		default:
			return undefined;
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
