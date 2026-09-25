import { MAX_AUTOCOMPLETE_CHOICES } from "@/discord/command/autocomplete-limits";
import { resolveLocale } from "@/i18n/locale";
import type { Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";
import type { Choice } from "@/settings/choice";
import {
	type DynamicSuggestions,
	type FieldChoice,
	type FieldSpec,
	type SuggestionContext,
	type Suggestions,
	unhandledFieldKind,
} from "@/settings/fields/field";
import type { GuildDirectory } from "@/settings/ports/guild-directory";
import { timedSearch } from "@/settings/timed-search";

/**
 * The ports suggestions read: the guild's directory, the translator of static
 * labels, and where a slow or failed search is logged.
 */
export interface SuggestionPorts {
	readonly guilds: GuildDirectory;
	readonly translator: Translator;
	readonly logger: Logger;
}

/** What one field's suggestions are computed with: the ports, the field, and who asks. */
export interface SuggestionScope extends SuggestionPorts {
	readonly moduleId: string;
	/** The field's key, named in logs. */
	readonly key: string;
	readonly ctx: SuggestionContext;
}

/** A search the kernel runs on the module's behalf, whatever the value type it suggests. */
type AnyDynamicSuggestions = DynamicSuggestions<unknown>;

/**
 * The suggestions of one field for `query` (FR-021, FR-025): a channel, role
 * or member field searches the guild; an enum and static suggestions offer
 * their choices translated to the requester's locale, those whose name or
 * value contains the query (case-insensitive); a dynamic search gets the
 * query and the context as is. A list suggests for its item. At most
 * {@link MAX_AUTOCOMPLETE_CHOICES} results, the first ones kept; a search
 * slower than the budget or failing yields none (logged). Never throws.
 *
 * @param params.scope - who asks and the ports the search reads.
 * @param params.spec - the field's kind and constraints.
 * @param params.query - what was typed so far; empty for a first page.
 * @returns the suggestions, labels already translated.
 */
export async function suggestChoices(params: {
	scope: SuggestionScope;
	spec: FieldSpec;
	query: string;
}): Promise<readonly Choice[]> {
	const choices = await allChoices(params);
	return choices.slice(0, MAX_AUTOCOMPLETE_CHOICES);
}

async function allChoices(params: {
	scope: SuggestionScope;
	spec: FieldSpec;
	query: string;
}): Promise<readonly Choice[]> {
	const { scope, spec, query } = params;
	const { guilds, ctx } = scope;
	switch (spec.kind) {
		case "channel":
			return timed({
				scope,
				fallback: [],
				search: async () => named(await guilds.searchChannels(ctx.guildId, query, spec.types)),
			});
		case "role":
			return timed({
				scope,
				fallback: [],
				search: async () => named(await guilds.searchRoles(ctx.guildId, query)),
			});
		case "user":
			return timed({
				scope,
				fallback: [],
				search: async () => named(await guilds.searchMembers(ctx.guildId, query)),
			});
		case "enum":
			return matching({ choices: translated({ scope, choices: spec.choices }), query });
		case "integer":
		case "text":
			return declaredChoices({ scope, suggest: spec.suggest, query });
		case "list":
			return allChoices({ scope, spec: spec.item.spec, query });
		case "color":
		case "duration":
		case "number":
		case "boolean":
		case "secret":
		case "toggles":
			return [];
		default:
			return unhandledFieldKind(spec);
	}
}

/** The suggestions a module declared on an integer or text field, if any. */
async function declaredChoices(params: {
	scope: SuggestionScope;
	suggest: Suggestions<string> | Suggestions<number> | undefined;
	query: string;
}): Promise<readonly Choice[]> {
	const { scope, suggest, query } = params;
	if (suggest === undefined) {
		return [];
	}
	if ("choices" in suggest) {
		return matching({ choices: translated({ scope, choices: suggest.choices }), query });
	}
	const search: AnyDynamicSuggestions = suggest;
	return timed({ scope, fallback: [], search: () => search.resolve(query, scope.ctx) });
}

/**
 * The readable label of one stored value of a field, in the requester's
 * locale: a channel, role or member's name on the guild, a static choice's
 * translated label, or what a dynamic search says (see {@link dynamicLabel}).
 * A list reads `value` as one of its items. Never throws.
 *
 * @param params.scope - who asks and the ports the label reads.
 * @param params.spec - the field's kind and constraints.
 * @param params.value - the stored value.
 * @returns the label, or `undefined` when none is known.
 */
export async function suggestionLabel(params: {
	scope: SuggestionScope;
	spec: FieldSpec;
	value: unknown;
}): Promise<string | undefined> {
	const { scope, spec, value } = params;
	const { guilds, ctx } = scope;
	switch (spec.kind) {
		case "channel":
			return entityName({ scope, find: (id) => guilds.channel(ctx.guildId, id), value });
		case "role":
			return entityName({ scope, find: (id) => guilds.role(ctx.guildId, id), value });
		case "user":
			return entityName({ scope, find: (id) => guilds.member(ctx.guildId, id), value });
		case "enum":
			return staticLabel({ scope, choices: spec.choices, value });
		case "integer":
		case "text":
			if (spec.suggest === undefined) {
				return undefined;
			}
			return "choices" in spec.suggest
				? staticLabel({ scope, choices: spec.suggest.choices, value })
				: dynamicLabel({ scope, suggest: spec.suggest, value });
		case "list":
			return suggestionLabel({ scope, spec: spec.item.spec, value });
		case "color":
		case "duration":
		case "number":
		case "boolean":
		case "secret":
		case "toggles":
			return undefined;
		default:
			return unhandledFieldKind(spec);
	}
}

/**
 * What a dynamic search calls `value` (FR-022): its own `label` when it
 * declares one, otherwise the name of the result of `resolve(String(value))`
 * whose value is exactly `value`. `undefined` when the search does not know
 * the value, or runs past the budget or fails (logged). A strict field
 * accepts exactly the values this labels (FR-023).
 *
 * @param params.scope - who asks, and where a slow or failed search is logged.
 * @param params.suggest - the field's search.
 * @param params.value - the value to label.
 * @returns the label, or `undefined`.
 */
export function dynamicLabel(params: {
	scope: SuggestionScope;
	suggest: AnyDynamicSuggestions;
	value: unknown;
}): Promise<string | undefined> {
	const { scope, suggest, value } = params;
	const { label } = suggest;
	if (label !== undefined) {
		return timed({ scope, fallback: undefined, search: () => label(value, scope.ctx) });
	}
	return timed({
		scope,
		fallback: undefined,
		search: async () => {
			const results = await suggest.resolve(String(value), scope.ctx);
			return results.find((choice) => choice.value === value)?.name;
		},
	});
}

/** A search within the suggestion budget, logged under the scope's module, field and guild. */
function timed<T>(params: {
	scope: SuggestionScope;
	fallback: T;
	search: () => Promise<T>;
}): Promise<T> {
	const { scope, fallback, search } = params;
	return timedSearch({
		search,
		fallback,
		logger: scope.logger,
		at: { moduleId: scope.moduleId, field: scope.key, guildId: scope.ctx.guildId },
	});
}

/** The name of the guild entity a stored id names, if the guild still has it. */
function entityName(params: {
	scope: SuggestionScope;
	find: (id: string) => Promise<{ readonly name: string } | null>;
	value: unknown;
}): Promise<string | undefined> {
	const { scope, find, value } = params;
	if (typeof value !== "string") {
		return Promise.resolve(undefined);
	}
	return timed({ scope, fallback: undefined, search: async () => (await find(value))?.name });
}

/** Guild entities as choices: their name shown, their id stored. */
function named(entities: readonly { readonly id: string; readonly name: string }[]): Choice[] {
	return entities.map((entity) => ({ name: entity.name, value: entity.id }));
}

/** Static choices with their labels translated to the requester's locale. */
function translated(params: {
	scope: SuggestionScope;
	choices: readonly FieldChoice<string | number>[];
}): Choice[] {
	const { scope, choices } = params;
	const locale = resolveLocale([scope.ctx.locale], scope.translator.defaultLocale);
	return choices.map((choice) => ({
		name: scope.translator.translate(locale, choice.label),
		value: choice.value,
	}));
}

/** The choices whose name or value contains `query`, case-insensitive; all of them for an empty query. */
function matching(params: { choices: readonly Choice[]; query: string }): readonly Choice[] {
	const needle = params.query.trim().toLowerCase();
	return params.choices.filter(
		(choice) =>
			choice.name.toLowerCase().includes(needle) ||
			String(choice.value).toLowerCase().includes(needle),
	);
}

/** The translated label of the static choice storing `value`. */
function staticLabel(params: {
	scope: SuggestionScope;
	choices: readonly FieldChoice<string | number>[];
	value: unknown;
}): string | undefined {
	return translated(params).find((choice) => choice.value === params.value)?.name;
}
