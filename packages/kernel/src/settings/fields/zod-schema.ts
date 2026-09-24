import * as z from "zod";
import { parseColor } from "@/color";
import { parseDuration } from "@/settings/duration";
import {
	type AnyField,
	type BoundsOptions,
	FIELD_LIMITS,
	type FieldChoice,
	unhandledFieldKind,
} from "@/settings/fields/field";
import type { SettingsIssueCode } from "@/settings/settings-validation-error";

/** A Discord snowflake: 17 to 20 digits. */
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

/** Custom Zod issue parameter carrying the kernel issue code. */
const ISSUE_CODE_PARAM = "settingsCode";

/** Why one value failed its field's own validation, before any guild check. */
export interface FieldValueIssue {
	/**
	 * Path inside the value: `[]` for the value, `[i]` for a list item, `[key]`
	 * for a toggle.
	 */
	readonly path: readonly (number | string)[];
	readonly code: SettingsIssueCode;
	/** `{ min }` or `{ max }` for bound codes, empty otherwise. */
	readonly params: Readonly<Record<string, number>>;
}

/** Outcome of {@link parseFieldValue}: the stored form of the value, or its issues. */
export type FieldParseResult =
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly issues: readonly FieldValueIssue[] };

const SCHEMAS = new WeakMap<AnyField, z.ZodType>();

/**
 * Check a value against its field's kind and constraints (kind, bounds,
 * lengths, list size, duplicates, enum membership, toggle keys) and turn it
 * into its stored form: a colour becomes `#rrggbb`, a duration whole seconds,
 * toggles a boolean for every declared key (a missing key takes its default).
 *
 * @param params.field - the field the value belongs to.
 * @param params.value - the raw value, of any type.
 * @returns the stored value, or every issue found.
 */
export function parseFieldValue(params: { field: AnyField; value: unknown }): FieldParseResult {
	const result = schemaOf(params.field).safeParse(params.value);
	if (result.success) {
		return { ok: true, value: result.data };
	}
	return { ok: false, issues: result.error.issues.map(toFieldValueIssue) };
}

/**
 * Drop from a stored value what its field no longer declares, so it reads as
 * if the key had never been stored (FR-017): a toggle whose key left `keys`.
 * Any other value is returned as is. Submissions skip this step, so an
 * undeclared toggle there stays `unknownChoice`.
 *
 * @param params.field - the field the stored value belongs to.
 * @param params.value - the value as read from storage, of any type.
 * @returns the value without its undeclared toggles.
 */
export function pruneStoredValue(params: { field: AnyField; value: unknown }): unknown {
	const { field: target, value } = params;
	if (target.spec.kind !== "toggles" || !isPlainRecord(value)) {
		return value;
	}
	const { keys } = target.spec;
	return Object.fromEntries(Object.entries(value).filter(([key]) => keys.includes(key)));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaOf(target: AnyField): z.ZodType {
	const cached = SCHEMAS.get(target);
	if (cached !== undefined) {
		return cached;
	}
	const schema = compileSchema(target);
	SCHEMAS.set(target, schema);
	return schema;
}

/**
 * Length checks (text length, list size) are gated behind a bare type check
 * with `pipe`: Zod keeps running them after a type failure whenever the input
 * has a `length`, which would report a length issue on top of `type`.
 */
function compileSchema(target: AnyField): z.ZodType {
	const { spec } = target;
	switch (spec.kind) {
		case "channel":
		case "role":
		case "user":
			return z.string().regex(SNOWFLAKE_PATTERN);
		case "color":
			return z.string().transform(toStoredColor);
		case "duration":
			return z.preprocess(toSeconds, withBounds(z.int().min(0), spec));
		case "enum":
			return z.enum(spec.choices.map(choiceValue));
		case "integer":
			return withBounds(z.int(), spec);
		case "number":
			return withBounds(z.number(), spec);
		case "text":
			return z.string().pipe(
				z
					.string()
					.min(spec.minLength ?? 0)
					.max(spec.maxLength ?? FIELD_LIMITS.textMaxLength),
			);
		case "boolean":
			return z.boolean();
		case "secret":
			return z.string();
		case "list":
			return z.array(z.unknown()).pipe(
				z
					.array(schemaOf(spec.item))
					.min(spec.minItems ?? 0)
					.max(spec.maxItems ?? FIELD_LIMITS.listMaxItems)
					.superRefine(rejectDuplicates),
			);
		case "toggles":
			return z
				.record(z.string(), z.unknown())
				.superRefine(checkToggles(spec.keys))
				.transform((toggles) => ({ ...(target.default as object), ...toggles }));
		default:
			return unhandledFieldKind(spec);
	}
}

function withBounds(schema: z.ZodNumber, bounds: BoundsOptions): z.ZodNumber {
	const withMin = bounds.min === undefined ? schema : schema.min(bounds.min);
	return bounds.max === undefined ? withMin : withMin.max(bounds.max);
}

function choiceValue(choice: FieldChoice<string>): string {
	return choice.value;
}

function toStoredColor(raw: string, ctx: z.core.$RefinementCtx): string {
	const hex = parseColor(raw);
	if (hex === null) {
		ctx.addIssue({ code: "custom", input: raw, params: { [ISSUE_CODE_PARAM]: "type" } });
		return z.NEVER;
	}
	return hex;
}

/** A duration string becomes seconds; anything else is left for the schema to judge. */
function toSeconds(input: unknown): unknown {
	if (typeof input !== "string") {
		return input;
	}
	return parseDuration(input) ?? input;
}

function rejectDuplicates(values: readonly unknown[], ctx: z.core.$RefinementCtx): void {
	const seen = new Set<unknown>();
	for (const [index, value] of values.entries()) {
		if (seen.has(value)) {
			ctx.addIssue({
				code: "custom",
				input: value,
				path: [index],
				params: { [ISSUE_CODE_PARAM]: "duplicate" },
			});
		}
		seen.add(value);
	}
}

/** Every toggle must be a declared key holding a boolean. */
function checkToggles(
	keys: readonly string[],
): (toggles: Record<string, unknown>, ctx: z.core.$RefinementCtx) => void {
	return (toggles, ctx) => {
		for (const [key, value] of Object.entries(toggles)) {
			if (!keys.includes(key)) {
				ctx.addIssue({
					code: "custom",
					input: value,
					path: [key],
					params: { [ISSUE_CODE_PARAM]: "unknownChoice" },
				});
			} else if (typeof value !== "boolean") {
				ctx.addIssue({ code: "custom", input: value, path: [key] });
			}
		}
	};
}

function toFieldValueIssue(issue: z.core.$ZodIssue): FieldValueIssue {
	const path = issue.path.filter(isPathSegment);
	switch (issue.code) {
		case "too_small":
			return { path, code: minCode(issue.origin), params: { min: Number(issue.minimum) } };
		case "too_big":
			return { path, code: maxCode(issue.origin), params: { max: Number(issue.maximum) } };
		case "invalid_value":
			return { path, code: "unknownChoice", params: {} };
		case "custom":
			return { path, code: customCode(issue.params), params: {} };
		default:
			return { path, code: "type", params: {} };
	}
}

function isPathSegment(segment: PropertyKey): segment is number | string {
	return typeof segment !== "symbol";
}

function minCode(origin: string): SettingsIssueCode {
	if (origin === "array") {
		return "minItems";
	}
	if (origin === "string") {
		return "minLength";
	}
	return "min";
}

function maxCode(origin: string): SettingsIssueCode {
	if (origin === "array") {
		return "maxItems";
	}
	if (origin === "string") {
		return "maxLength";
	}
	return "max";
}

function customCode(params: Readonly<Record<string, unknown>> | undefined): SettingsIssueCode {
	const code = params?.[ISSUE_CODE_PARAM];
	return code === "duplicate" || code === "unknownChoice" ? code : "type";
}
