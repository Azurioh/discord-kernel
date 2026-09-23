import type { Field, FieldPresence } from "@/settings/fields";

/** The fields of a declaration, by key. */
type FieldsOf<D> = D extends { readonly fields: infer F } ? F : never;

/**
 * The value type module logic reads for one field: `T` when the field has a
 * default (a toggles field always has one), `T | undefined` otherwise, even
 * when required: a guild may not have configured it yet.
 */
export type FieldValue<F> =
	F extends Field<infer T, "defined">
		? T
		: F extends Field<infer T, FieldPresence>
			? T | undefined
			: never;

/** What a surface shows for a secret: whether it is set, never its value. */
export interface SecretState {
	readonly isSet: boolean;
}

/** The value type a surface reads for one field: secrets become {@link SecretState}. */
export type SurfaceFieldValue<F> = F extends { readonly spec: { readonly kind: "secret" } }
	? SecretState
	: FieldValue<F>;

/**
 * The values module logic reads from a declaration, typed from it: one entry
 * per declared field, secrets included.
 */
export type SettingsValues<D> = {
	readonly [K in keyof FieldsOf<D>]: FieldValue<FieldsOf<D>[K]>;
};

/**
 * The values a configuration surface reads from a declaration: like
 * {@link SettingsValues}, with each secret replaced by {@link SecretState}.
 */
export type SurfaceValues<D> = {
	readonly [K in keyof FieldsOf<D>]: SurfaceFieldValue<FieldsOf<D>[K]>;
};
