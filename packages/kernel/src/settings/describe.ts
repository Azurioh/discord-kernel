import { resolveLocale, SOURCE_LOCALE } from "@/i18n/locale";
import type { TranslateKey, Translator } from "@/i18n/translator";
import type { SettingsDeclaration, SettingsGroup } from "@/settings/define-settings";
import { annotateField } from "@/settings/describe-field";
import { displayOrder } from "@/settings/field-order";
import { fieldsJsonSchema, type JsonSchemaNode } from "@/settings/fields/zod-schema";

/** URN prefix of a described module: `urn:discord-kernel:settings:<id>:v<version>`. */
const SCHEMA_ID_PREFIX = "urn:discord-kernel:settings";

/** A JSON value, as a JSON Schema document holds. */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };

/**
 * A JSON Schema draft 2020-12 document describing one module's settings, every
 * text already translated, with kernel hints under the `x-kernel` keyword.
 */
export type SettingsSchema = { readonly [keyword: string]: JsonValue };

/**
 * Describe a module's settings for surfaces other than Discord (FR-030).
 *
 * @param params.declaration - the module's settings declaration.
 * @param params.locale - any locale string; an unsupported one falls back to English.
 * @param params.translator - translates the declaration's catalog keys.
 * @returns the translated JSON Schema document of the module.
 */
export function describeSettings(params: {
	declaration: SettingsDeclaration;
	locale: string;
	translator: Translator;
}): SettingsSchema {
	const { declaration, translator } = params;
	const locale = resolveLocale([params.locale], SOURCE_LOCALE);
	const translate: TranslateKey = (key) => translator.translate(locale, key);
	const { $schema, ...fields } = fieldsJsonSchema({
		fields: declaration.fields,
		annotate: (field, schema) => annotateField({ field, schema, translate }),
	});
	const document: JsonSchemaNode = {
		$schema,
		$id: `${SCHEMA_ID_PREFIX}:${declaration.id}:v${declaration.version}`,
		title: translate(declaration.labels.title),
	};
	if (declaration.labels.description !== undefined) {
		document.description = translate(declaration.labels.description);
	}
	const moduleHints: JsonSchemaNode = { module: declaration.id, version: declaration.version };
	if (declaration.ui?.icon !== undefined) {
		moduleHints.icon = declaration.ui.icon;
	}
	moduleHints.locale = locale;
	moduleHints.groups = describeGroups({ declaration, translate });
	// Zod emits JSON only, and every annotation comes from the declaration's JSON values.
	return { ...document, ...fields, "x-kernel": moduleHints } as SettingsSchema;
}

/** The declared groups, translated, in the display order every surface shares. */
function describeGroups(params: {
	declaration: SettingsDeclaration;
	translate: TranslateKey;
}): JsonSchemaNode[] {
	const { declaration, translate } = params;
	return displayOrder(declaration).groups.flatMap((id) => {
		const group = declaration.groups?.[id];
		return group === undefined ? [] : [describeGroup({ id, group, translate })];
	});
}

function describeGroup(params: {
	id: string;
	group: SettingsGroup;
	translate: TranslateKey;
}): JsonSchemaNode {
	const { id, group, translate } = params;
	const described: JsonSchemaNode = { id, title: translate(group.label) };
	if (group.description !== undefined) {
		described.description = translate(group.description);
	}
	if (group.order !== undefined) {
		described.order = group.order;
	}
	return described;
}
