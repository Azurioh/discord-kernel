import type { TranslateKey } from "@/i18n/translator";
import {
	type AnyField,
	type FieldChoice,
	type Suggestions,
	unhandledFieldKind,
} from "@/settings/fields/field";
import type { JsonSchemaNode } from "@/settings/fields/zod-schema";

/**
 * Add a field's translated texts and hints to the JSON Schema of its stored
 * value: `title`, `description`, `default` and `examples` under their standard
 * keywords, labelled choices as `oneOf`, and the kernel hints under `x-kernel`.
 * A secret is write-only and never carries a default or an example.
 *
 * @param params.field - the field, or list item, being described.
 * @param params.schema - the JSON Schema of its stored value, annotated in place.
 * @param params.translate - translates the field's catalog keys.
 */
export function annotateField(params: {
	field: AnyField;
	schema: JsonSchemaNode;
	translate: TranslateKey;
}): void {
	const { field, schema, translate } = params;
	if (field.label !== undefined) {
		schema.title = translate(field.label);
	}
	if (field.description !== undefined) {
		schema.description = translate(field.description);
	}
	if (field.spec.kind === "secret") {
		schema.writeOnly = true;
	} else {
		if (field.default !== undefined) {
			schema.default = field.default;
		}
		if (field.ui?.examples !== undefined) {
			schema.examples = field.ui.examples;
		}
	}
	if (field.spec.kind === "enum") {
		delete schema.enum;
		schema.oneOf = labelledChoices({ choices: field.spec.choices, translate });
	}
	if (field.spec.kind === "toggles") {
		annotateToggles({ field, keyLabels: field.spec.keyLabels, schema, translate });
	}
	schema["x-kernel"] = kernelHints({ field, translate });
}

/** Each toggle gets its translated label and its own default. */
function annotateToggles(params: {
	field: AnyField;
	keyLabels: Readonly<Partial<Record<string, string>>> | undefined;
	schema: JsonSchemaNode;
	translate: TranslateKey;
}): void {
	const { field, keyLabels, schema, translate } = params;
	const defaults = field.default as Readonly<Record<string, boolean>>;
	const properties = schema.properties as Record<string, JsonSchemaNode>;
	for (const [key, toggle] of Object.entries(properties)) {
		const label = keyLabels?.[key];
		if (label !== undefined) {
			toggle.title = translate(label);
		}
		toggle.default = defaults[key];
	}
}

/** The `x-kernel` keyword of a field: its kind and every declared hint. */
function kernelHints(params: { field: AnyField; translate: TranslateKey }): JsonSchemaNode {
	const { field, translate } = params;
	const hints: JsonSchemaNode = { kind: field.spec.kind, ...specHints(field) };
	const { ui } = field;
	if (ui?.group !== undefined) {
		hints.group = ui.group;
	}
	if (ui?.order !== undefined) {
		hints.order = ui.order;
	}
	if (field.unit !== undefined) {
		hints.unit = translate(field.unit);
	}
	if (ui?.hint !== undefined) {
		hints.hint = ui.hint;
	}
	if (ui?.advanced !== undefined) {
		hints.advanced = ui.advanced;
	}
	return { ...hints, ...suggestionHints({ field, translate }) };
}

/** Kind-specific hints: accepted channel types. */
function specHints(field: AnyField): JsonSchemaNode {
	const { spec } = field;
	if (spec.kind === "channel" && spec.types !== undefined) {
		return { channelTypes: spec.types };
	}
	return {};
}

/**
 * Where a surface finds values to offer: `guild` for Discord entities,
 * `static` for fixed choices, `dynamic` for a server-side search.
 */
function suggestionHints(params: { field: AnyField; translate: TranslateKey }): JsonSchemaNode {
	const { spec } = params.field;
	switch (spec.kind) {
		case "channel":
		case "role":
		case "user":
			return { suggest: "guild" };
		case "enum":
			return { suggest: "static" };
		case "integer":
		case "text":
			return spec.suggest === undefined
				? {}
				: declaredSuggestions({ suggest: spec.suggest, translate: params.translate });
		case "color":
		case "duration":
		case "number":
		case "boolean":
		case "secret":
		case "list":
		case "toggles":
			return {};
		default:
			return unhandledFieldKind(spec);
	}
}

/** Static suggestions carry their translated choices; a strict search says so. */
function declaredSuggestions(params: {
	suggest: Suggestions<string> | Suggestions<number>;
	translate: TranslateKey;
}): JsonSchemaNode {
	const { suggest, translate } = params;
	if ("choices" in suggest) {
		return {
			suggest: "static",
			choices: labelledChoices({ choices: suggest.choices, translate }),
		};
	}
	return suggest.strict === true ? { suggest: "dynamic", strict: true } : { suggest: "dynamic" };
}

function labelledChoices(params: {
	choices: readonly FieldChoice<unknown>[];
	translate: TranslateKey;
}): JsonSchemaNode[] {
	const { choices, translate } = params;
	return choices.map((choice) => ({ const: choice.value, title: translate(choice.label) }));
}
