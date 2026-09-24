import type {
	BoundsOptions,
	ChannelOptions,
	EnumOptions,
	Field,
	FieldOptions,
	FieldSpec,
	IntegerOptions,
	ListOptions,
	SecretField,
	SecretOptions,
	TextOptions,
	TogglesOptions,
	ToggleValues,
} from "@/settings/fields/field";

/** Options that make a field always have a value. */
type Defined<T> = { readonly default: T };

/** A builder whose result is `"defined"` when defaulted. */
export interface FieldBuilder<T, X> {
	(options: X & FieldOptions<T> & Defined<T>): Field<T, "defined">;
	(options?: X & FieldOptions<T>): Field<T, "optional">;
}

/** The field builders of {@link field}. */
export interface FieldBuilders {
	readonly channel: FieldBuilder<string, ChannelOptions>;
	readonly role: FieldBuilder<string, unknown>;
	readonly user: FieldBuilder<string, unknown>;
	/**
	 * Stored as `#rrggbb`; accepts hex codes and the base colour names, never the
	 * aliases a bot registers for its Discord inputs.
	 */
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
