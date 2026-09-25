import type { SearchOptions } from "@/discord/components/settings-editor/from-declaration-controls";
import type { DeclarationSubject } from "@/discord/components/settings-editor/from-declaration-subject";
import {
	MAX_SELECT_OPTION_TEXT,
	MAX_SELECT_OPTIONS,
} from "@/discord/components/settings-editor/settings-editor.view";
import type { SettingsEditorChoice } from "@/discord/components/settings-editor/settings-editor-fields";
import { SETTINGS_EDITOR_MESSAGES } from "@/discord/i18n";
import { truncateText } from "@/discord/ui/truncate-text";
import type { Choice } from "@/settings/choice";
import type { SettingsDeclaration } from "@/settings/define-settings";
import { fieldSearch } from "@/settings/field-search";
import type { RequestContext, SettingsService } from "@/settings/settings-service";

/**
 * What each searchable field's select offers on the Discord screen (FR-026a):
 * the first {@link MAX_SELECT_OPTIONS} results of its search for an empty
 * query, since a select cannot be searched as it is typed. The field's
 * current value leads the list when the results miss it, so a modal opened
 * and sent back unchanged keeps it. A field whose search offered nothing
 * (it failed or timed out, logged by the service) has no entry: the screen
 * types it instead.
 *
 * @param params.declaration - the module's settings declaration.
 * @param params.service - the settings service the searches run through.
 * @param params.ctx - the guild, the administrator and their locale.
 * @param params.subject - the screen's subject: the values searches see, and
 * the current values' labels.
 * @returns the options of each searchable field that has any, by field key.
 */
export async function loadSearchOptions(params: {
	declaration: SettingsDeclaration;
	service: SettingsService;
	ctx: RequestContext;
	subject: DeclarationSubject;
}): Promise<SearchOptions> {
	const { declaration, service, ctx, subject } = params;
	const searched = await Promise.all(
		Object.entries(declaration.fields)
			.filter(([, declared]) => fieldSearch(declared.spec) !== undefined)
			.map(async ([key]) => {
				const results = await service.suggest(declaration, key, "", {
					...ctx,
					values: subject.values,
				});
				const options = withCurrent({ results, key, subject }).map(toEditorChoice);
				return [key, options.slice(0, MAX_SELECT_OPTIONS)] as const;
			}),
	);
	return new Map(searched.filter(([, options]) => options.length > 0));
}

/** The results with the field's current value first when they miss it. */
function withCurrent(params: {
	results: readonly Choice[];
	key: string;
	subject: DeclarationSubject;
}): readonly Choice[] {
	const { results, key, subject } = params;
	const value = subject.values[key];
	if (results.length === 0 || (typeof value !== "string" && typeof value !== "number")) {
		return results;
	}
	if (results.some((choice) => String(choice.value) === String(value))) {
		return results;
	}
	return [{ name: subject.labels[key] ?? String(value), value }, ...results];
}

/** A search result as a select option: its name shown as is, cut to what an option shows. */
function toEditorChoice(choice: Choice): SettingsEditorChoice {
	return {
		value: String(choice.value),
		labelKey: SETTINGS_EDITOR_MESSAGES.choiceLabel,
		labelParams: { label: truncateText(choice.name, MAX_SELECT_OPTION_TEXT) },
	};
}
