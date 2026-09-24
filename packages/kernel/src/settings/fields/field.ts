import type { Choice } from "@/settings/choice";
import type { ChannelKind } from "@/settings/ports/guild-directory";

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
 * `T`. Built by the `field` builders; the validation schema behind it stays internal.
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

/** Kind-specific options of a channel field. */
export type ChannelOptions = { readonly types?: readonly ChannelKind[] };
/** Inclusive numeric bounds of a duration, integer or number field. */
export type BoundsOptions = { readonly min?: number; readonly max?: number };
/** Kind-specific options of an integer field. */
export type IntegerOptions = BoundsOptions & { readonly suggest?: Suggestions<number> };
/** Kind-specific options of a text field. */
export type TextOptions = {
	readonly minLength?: number;
	readonly maxLength?: number;
	readonly suggest?: Suggestions<string>;
};
/** Kind-specific options of a list field. */
export type ListOptions = { readonly minItems?: number; readonly maxItems?: number };
/** Kind-specific options of an enum field. */
export type EnumOptions<V> = { readonly choices: readonly FieldChoice<V>[] };

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

/**
 * The compile-time guard closing every `switch` on a field kind: a new kind
 * left unhandled makes the call a type error instead of a silent fallthrough.
 *
 * @throws Error when reached at runtime, which only a spec built outside the
 * type system can cause.
 */
export function unhandledFieldKind(spec: never): never {
	throw new Error(`Unhandled field kind: ${(spec as FieldSpec).kind}`);
}
