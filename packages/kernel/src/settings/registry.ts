import type { TranslationRegistry } from "@/i18n/catalog";
import type { SettingsDeclaration } from "@/settings/define-settings";
import {
	type AnyField,
	type FieldChoice,
	type FieldSpec,
	type Suggestions,
	unhandledFieldKind,
} from "@/settings/fields/field";
import { SettingsDeclarationError } from "@/settings/settings-declaration-error";

/** Every settings declaration of the bot, checked at boot. */
export interface SettingsRegistry {
	/** In registration order. */
	readonly declarations: readonly SettingsDeclaration[];
	get(id: string): SettingsDeclaration | undefined;
}

/**
 * Collect the modules' settings declarations at boot.
 *
 * @param input.declarations - every module's declaration.
 * @param input.translations - must already contain the modules' catalogs.
 * @returns the registry of declarations, by id.
 * @throws SettingsDeclarationError when two declarations share an id (FR-005)
 * or a declaration references a catalog key without an English source (FR-028).
 */
export function createSettingsRegistry(input: {
	declarations: readonly SettingsDeclaration[];
	translations: TranslationRegistry;
}): SettingsRegistry {
	const byId = new Map<string, SettingsDeclaration>();
	for (const declaration of input.declarations) {
		if (byId.has(declaration.id)) {
			throw new SettingsDeclarationError(declaration.id, "is declared more than once");
		}
		checkKeys({ declaration, translations: input.translations });
		byId.set(declaration.id, declaration);
	}
	return {
		declarations: [...byId.values()],
		get: (id) => byId.get(id),
	};
}

function checkKeys(params: {
	declaration: SettingsDeclaration;
	translations: TranslationRegistry;
}): void {
	const { declaration, translations } = params;
	for (const key of catalogKeys(declaration)) {
		if (!translations.has(key)) {
			throw new SettingsDeclarationError(
				declaration.id,
				`catalog key "${key}" has no English source`,
			);
		}
	}
}

/**
 * Every catalog key a declaration references: labels, groups, fields, choices
 * and toggle key labels.
 */
function* catalogKeys(declaration: SettingsDeclaration): Generator<string> {
	yield* defined([declaration.labels.title, declaration.labels.description]);
	for (const group of Object.values(declaration.groups ?? {})) {
		yield* defined([group.label, group.description]);
	}
	for (const declared of Object.values(declaration.fields)) {
		yield* fieldKeys(declared);
	}
}

function* fieldKeys(declared: AnyField): Generator<string> {
	yield* defined([declared.label, declared.description, declared.placeholder, declared.unit]);
	yield* specKeys(declared.spec);
}

function* specKeys(spec: FieldSpec): Generator<string> {
	switch (spec.kind) {
		case "enum":
			yield* spec.choices.map(choiceLabel);
			return;
		case "integer":
		case "text":
			yield* suggestionKeys(spec.suggest);
			return;
		case "list":
			yield* fieldKeys(spec.item);
			return;
		case "toggles":
			yield* defined(Object.values(spec.keyLabels ?? {}));
			return;
		case "channel":
		case "role":
		case "user":
		case "color":
		case "duration":
		case "number":
		case "boolean":
		case "secret":
			return;
		default:
			unhandledFieldKind(spec);
	}
}

function suggestionKeys(suggest: Suggestions<unknown> | undefined): string[] {
	if (suggest === undefined || !("choices" in suggest)) {
		return [];
	}
	return suggest.choices.map(choiceLabel);
}

function choiceLabel(choice: FieldChoice<unknown>): string {
	return choice.label;
}

function defined(keys: readonly (string | undefined)[]): string[] {
	return keys.filter((key) => key !== undefined);
}
