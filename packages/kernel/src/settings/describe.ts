import { resolveLocale, SOURCE_LOCALE } from "@/i18n/locale";
import type { TranslateKey, Translator } from "@/i18n/translator";
import type { SettingsDeclaration, SettingsGroup } from "@/settings/define-settings";
import { annotateField } from "@/settings/describe-field";
import { fieldsJsonSchema, type JsonSchemaNode } from "@/settings/fields/zod-schema";

/** Rank of a group with no preferred position or no order: after every ranked one. */
const UNRANKED = Number.MAX_SAFE_INTEGER;

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

/** The declared groups, translated, in the module's preferred order, then by their own order. */
function describeGroups(params: {
	declaration: SettingsDeclaration;
	translate: TranslateKey;
}): JsonSchemaNode[] {
	const { declaration, translate } = params;
	const groupOrder = declaration.ui?.groupOrder ?? [];
	const ranked = Object.entries(declaration.groups ?? {}).map(([id, group]) => ({
		id,
		group,
		rank: preferredRank({ groupOrder, id }),
	}));
	ranked.sort((left, right) => compareGroups({ left, right }));
	return ranked.map(({ id, group }) => describeGroup({ id, group, translate }));
}

/** A group's place in the module's preferred order; unlisted groups come last. */
function preferredRank(params: { groupOrder: readonly string[]; id: string }): number {
	const position = params.groupOrder.indexOf(params.id);
	return position === -1 ? UNRANKED : position;
}

/** A group ranked by the module's preferred order, then by its own order. */
interface RankedGroup {
	readonly id: string;
	readonly group: SettingsGroup;
	readonly rank: number;
}

function compareGroups(params: { left: RankedGroup; right: RankedGroup }): number {
	const { left, right } = params;
	if (left.rank !== right.rank) {
		return left.rank - right.rank;
	}
	return (left.group.order ?? UNRANKED) - (right.group.order ?? UNRANKED);
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
