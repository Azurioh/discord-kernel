import * as z from "zod";
import { parseColorInput } from "@/discord/ui/color-input";
import type { Choice } from "@/settings/choice";
import { parseDuration } from "@/settings/duration";
import type { ChannelKind } from "@/settings/ports/guild-directory";
import type { SettingsIssueCode } from "@/settings/settings-validation-error";

/** Discord's hard limits that a declaration must stay within. */
export const FIELD_LIMITS = {
	/** Longest text a Discord text input accepts. */
	textMaxLength: 4000,
	/** Most items a list field may hold (one select menu). */
	listMaxItems: 25,
	/** Most static choices an enum or a suggestion list may declare (one select menu). */
	staticChoices: 25,
} as const;

/** Kinds a list field may hold. */
export const LIST_ITEM_KINDS: readonly FieldKind[] = [
	"channel",
	"role",
	"user",
	"enum",
	"integer",
	"text",
];

/** A Discord snowflake: 17 to 20 digits. */
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

/** Custom Zod issue parameter carrying the kernel issue code. */
const ISSUE_CODE_PARAM = "settingsCode";

/**
 * Whether a field always has a value (`"defined"`: it has a default) or may be
 * unset (`"optional"`: no default, even when required, since a guild may not
 * have configured it yet). Drives the value type of {@link SettingsValues}.
 */
export type FieldPresence = "defined" | "optional";

declare const presence: unique symbol;

/** One labelled static choice: the stored value and the catalog key of its label. */
export interface FieldChoice<V> {
	readonly value: V;
	readonly label: string;
}

/** What a suggestion search knows about the request. */
export interface SuggestionContext {
	readonly guildId: string;
	readonly userId: string;
	readonly locale: string;
	/** The other values currently entered, possibly unsaved. */
	readonly values: Readonly<Record<string, unknown>>;
}

/** A fixed list of suggested values (1 to 25). */
export interface StaticSuggestions<T> {
	readonly choices: readonly FieldChoice<T>[];
}

/** A server-side search. `strict` rejects values the search does not know. */
export interface DynamicSuggestions<T> {
	resolve(query: string, ctx: SuggestionContext): Promise<readonly Choice[]>;
	label?(value: T, ctx: SuggestionContext): Promise<string | undefined>;
	readonly strict?: boolean;
}

/** Suggestions offered while a value is typed. */
export type Suggestions<T> = StaticSuggestions<T> | DynamicSuggestions<T>;

/**
 * Presentation hints (FR-020). They describe meaning, not layout; surfaces may
 * ignore them.
 */
export interface FieldUi<T = unknown> {
	/** Id of a group declared on the module. */
	readonly group?: string;
	readonly order?: number;
	/** Preferred control, e.g. `"slider"`. */
	readonly hint?: string;
	readonly advanced?: boolean;
	readonly examples?: readonly T[];
}

/** Options shared by every field kind. Texts are catalog keys. */
export interface FieldOptions<T> {
	/** Required on a module's fields; a list item needs none. */
	readonly label?: string;
	readonly description?: string;
	readonly placeholder?: string;
	readonly unit?: string;
	/** Unset until an administrator sets it, unless it has a default. */
	readonly required?: boolean;
	readonly default?: T;
	readonly ui?: FieldUi<T>;
	/** Opaque access declaration: stored, never enforced here (FR-032). */
	readonly access?: unknown;
}

/** Kind-specific constraints of a field. */
export type FieldSpec =
	| { readonly kind: "channel"; readonly types?: readonly ChannelKind[] }
	| { readonly kind: "role" }
	| { readonly kind: "user" }
	| { readonly kind: "color" }
	| { readonly kind: "duration"; readonly min?: number; readonly max?: number }
	| { readonly kind: "enum"; readonly choices: readonly FieldChoice<string>[] }
	| {
			readonly kind: "integer";
			readonly min?: number;
			readonly max?: number;
			readonly suggest?: Suggestions<number>;
	  }
	| { readonly kind: "number"; readonly min?: number; readonly max?: number }
	| {
			readonly kind: "text";
			readonly minLength?: number;
			readonly maxLength?: number;
			readonly suggest?: Suggestions<string>;
	  }
	| { readonly kind: "boolean" }
	| { readonly kind: "secret" }
	| {
			readonly kind: "list";
			readonly item: AnyField;
			readonly minItems?: number;
			readonly maxItems?: number;
	  }
	| {
			readonly kind: "toggles";
			readonly keys: readonly string[];
			/** Catalog key of each key's label, by key. */
			readonly keyLabels?: Readonly<Partial<Record<string, string>>>;
	  };

/** Every field kind. */
export type FieldKind = FieldSpec["kind"];

/**
 * A declared setting: its kind and constraints, its hints and its value type
 * `T`. Built by {@link field}; the validation schema behind it stays internal.
 */
export interface Field<T, P extends FieldPresence = FieldPresence> {
	readonly spec: FieldSpec;
	readonly label?: string;
	readonly description?: string;
	readonly placeholder?: string;
	readonly unit?: string;
	readonly required: boolean;
	readonly default?: T;
	readonly ui?: FieldUi<T>;
	readonly access?: unknown;
	/** Type-level only: never set at runtime. */
	readonly [presence]?: P;
}

/** Any field, whatever its value type. */
export type AnyField = Field<unknown>;

/** A secret field: readable by module logic, write-only for surfaces. */
export type SecretField<P extends FieldPresence = FieldPresence> = Field<string, P> & {
	readonly spec: { readonly kind: "secret" };
};

/** Options that make a field always have a value. */
type Defined<T> = { readonly default: T };

/** A builder whose result is `"defined"` when defaulted. */
export interface FieldBuilder<T, X> {
	(options: X & FieldOptions<T> & Defined<T>): Field<T, "defined">;
	(options?: X & FieldOptions<T>): Field<T, "optional">;
}

type ChannelOptions = { readonly types?: readonly ChannelKind[] };
type BoundsOptions = { readonly min?: number; readonly max?: number };
type IntegerOptions = BoundsOptions & { readonly suggest?: Suggestions<number> };
type TextOptions = {
	readonly minLength?: number;
	readonly maxLength?: number;
	readonly suggest?: Suggestions<string>;
};
type ListOptions = { readonly minItems?: number; readonly maxItems?: number };
type EnumOptions<V> = { readonly choices: readonly FieldChoice<V>[] };

/** The value of a toggles field: one boolean per declared key. */
export type ToggleValues<K extends string> = Readonly<Record<K, boolean>>;

/**
 * Options of a toggles field. `default` sets some keys; every other key
 * defaults to `false`, so the field always has a value. `keyLabels` are
 * catalog keys.
 */
export type TogglesOptions<K extends string> = Omit<
	FieldOptions<ToggleValues<K>>,
	"default" | "required"
> & {
	readonly keys: readonly K[];
	readonly keyLabels?: Readonly<Partial<Record<K, string>>>;
	readonly default?: Readonly<Partial<Record<K, boolean>>>;
};

/** Options of a secret: no default, no examples. */
export type SecretOptions = Omit<FieldOptions<string>, "default" | "ui"> & {
	readonly ui?: Omit<FieldUi, "examples">;
};

/** The field builders of {@link field}. */
export interface FieldBuilders {
	readonly channel: FieldBuilder<string, ChannelOptions>;
	readonly role: FieldBuilder<string, unknown>;
	readonly user: FieldBuilder<string, unknown>;
	/** Stored as `#rrggbb`; accepts hex codes and colour names. */
	readonly color: FieldBuilder<string, unknown>;
	/** Stored as whole seconds; accepts `"15m"`, `"1h30m"`… Bounds are in seconds. */
	readonly duration: FieldBuilder<number, BoundsOptions>;
	enum<const V extends string>(
		options: EnumOptions<V> & FieldOptions<NoInfer<V>> & Defined<NoInfer<V>>,
	): Field<V, "defined">;
	enum<const V extends string>(
		options: EnumOptions<V> & FieldOptions<NoInfer<V>>,
	): Field<V, "optional">;
	readonly integer: FieldBuilder<number, IntegerOptions>;
	readonly number: FieldBuilder<number, BoundsOptions>;
	readonly text: FieldBuilder<string, TextOptions>;
	readonly boolean: FieldBuilder<boolean, unknown>;
	secret(options?: SecretOptions): SecretField<"optional">;
	list<T>(
		item: Field<T>,
		options: ListOptions & FieldOptions<readonly T[]> & Defined<readonly T[]>,
	): Field<readonly T[], "defined">;
	list<T>(
		item: Field<T>,
		options?: ListOptions & FieldOptions<readonly T[]>,
	): Field<readonly T[], "optional">;
	/** A boolean per key, e.g. enabled modules; not allowed as a list item. */
	toggles<const K extends string>(options: TogglesOptions<K>): Field<ToggleValues<K>, "defined">;
}

/**
 * Assemble a field from its constraints and common options. The presence is
 * `never` here: the builder overloads narrow it from the options.
 */
function createField<T>(spec: FieldSpec, options: FieldOptions<T>): Field<T, never> {
	return { ...options, spec, required: options.required ?? false };
}

function channelField(options: ChannelOptions & FieldOptions<string> = {}): Field<string, never> {
	const { types, ...common } = options;
	return createField({ kind: "channel", types }, common);
}

function roleField(options: FieldOptions<string> = {}): Field<string, never> {
	return createField({ kind: "role" }, options);
}

function userField(options: FieldOptions<string> = {}): Field<string, never> {
	return createField({ kind: "user" }, options);
}

function colorField(options: FieldOptions<string> = {}): Field<string, never> {
	return createField({ kind: "color" }, options);
}

function durationField(options: BoundsOptions & FieldOptions<number> = {}): Field<number, never> {
	const { min, max, ...common } = options;
	return createField({ kind: "duration", min, max }, common);
}

function enumField<V extends string>(options: EnumOptions<V> & FieldOptions<V>): Field<V, never> {
	const { choices, ...common } = options;
	return createField({ kind: "enum", choices }, common);
}

function integerField(options: IntegerOptions & FieldOptions<number> = {}): Field<number, never> {
	const { min, max, suggest, ...common } = options;
	return createField({ kind: "integer", min, max, suggest }, common);
}

function numberField(options: BoundsOptions & FieldOptions<number> = {}): Field<number, never> {
	const { min, max, ...common } = options;
	return createField({ kind: "number", min, max }, common);
}

function textField(options: TextOptions & FieldOptions<string> = {}): Field<string, never> {
	const { minLength, maxLength, suggest, ...common } = options;
	return createField({ kind: "text", minLength, maxLength, suggest }, common);
}

function booleanField(options: FieldOptions<boolean> = {}): Field<boolean, never> {
	return createField({ kind: "boolean" }, options);
}

function secretField(options: SecretOptions = {}): SecretField<"optional"> {
	return { ...options, spec: { kind: "secret" }, required: options.required ?? false };
}

function listField<T>(
	item: Field<T>,
	options: ListOptions & FieldOptions<readonly T[]> = {},
): Field<readonly T[], never> {
	const { minItems, maxItems, ...common } = options;
	return createField({ kind: "list", item, minItems, maxItems }, common);
}

/**
 * The declared keys all start `false`, then `default` sets its own; a key
 * `default` names but `keys` lacks is kept, so the default fails its own field
 * when the declaration is checked.
 */
function togglesField<K extends string>(
	options: TogglesOptions<K>,
): Field<ToggleValues<K>, "defined"> {
	const { keys, keyLabels, default: defaults, ...common } = options;
	const off = Object.fromEntries(keys.map((key) => [key, false])) as Record<K, boolean>;
	return createField(
		{ kind: "toggles", keys, keyLabels },
		{ ...common, default: { ...off, ...defaults } },
	);
}

/**
 * Builders for every setting kind. Channel, role and user values are
 * snowflake strings; texts in the options are catalog keys.
 */
export const field: FieldBuilders = {
	channel: channelField,
	role: roleField,
	user: userField,
	color: colorField,
	duration: durationField,
	enum: enumField,
	integer: integerField,
	number: numberField,
	text: textField,
	boolean: booleanField,
	secret: secretField,
	list: listField,
	toggles: togglesField,
};

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
	const hex = parseColorInput(raw);
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
