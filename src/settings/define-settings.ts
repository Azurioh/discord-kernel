import {
	type AnyField,
	FIELD_LIMITS,
	type FieldSpec,
	LIST_ITEM_KINDS,
	parseFieldValue,
	type Suggestions,
} from "@/settings/fields";
import { SettingsDeclarationError } from "@/settings/settings-declaration-error";

/** A group of fields. Texts are catalog keys. */
export interface SettingsGroup {
	readonly label: string;
	readonly description?: string;
	readonly order?: number;
	/** Opaque access declaration: stored, never enforced here (FR-032). */
	readonly access?: unknown;
}

/** Module-level presentation hints (FR-020). */
export interface SettingsUi {
	readonly icon?: string;
	/** Group ids in their preferred order. */
	readonly groupOrder?: readonly string[];
}

/** Reshapes values stored under an older declaration version. */
export type SettingsMigration = (fromVersion: number, raw: unknown) => unknown;

/** What a module writes to declare its settings. */
export interface SettingsDeclarationInput {
	/** Unique across modules; lowercase kebab-case. */
	readonly id: string;
	/** Starts at 1; raised when stored data must be reshaped. */
	readonly version: number;
	readonly labels: { readonly title: string; readonly description?: string };
	readonly fields: Readonly<Record<string, AnyField>>;
	readonly groups?: Readonly<Record<string, SettingsGroup>>;
	/** Required when `version > 1`. */
	readonly migrate?: SettingsMigration;
	readonly ui?: SettingsUi;
	/** Opaque access declaration: stored, never enforced here (FR-032). */
	readonly access?: unknown;
}

/** A checked settings declaration, typed from what the module wrote. */
export type SettingsDeclaration<D extends SettingsDeclarationInput = SettingsDeclarationInput> = D;

/**
 * Declare a module's settings. The declaration is returned unchanged — hints
 * and access slots included — after the checks that need no guild.
 *
 * @param input - the module's declaration; keys and enum values stay literal.
 * @returns the same declaration, typed for `SettingsValues`.
 * @throws SettingsDeclarationError when a field has no label, a default fails
 * its own field, a secret has a default or examples, an enum or static
 * suggestion list has not 1 to 25 choices, a field names an undeclared group, a
 * text allows more than 4000 characters, a list more than 25 items or an item
 * kind lists cannot hold, a toggles field repeats a key or labels an undeclared
 * one, or the version is above 1 without a migration.
 */
export function defineSettings<const D extends SettingsDeclarationInput>(
	input: D,
): SettingsDeclaration<D> {
	checkVersion(input);
	for (const [key, declared] of Object.entries(input.fields)) {
		checkField({ declaration: input, key, declared });
	}
	return input;
}

function checkVersion(input: SettingsDeclarationInput): void {
	if (!Number.isInteger(input.version) || input.version < 1) {
		throw new SettingsDeclarationError(input.id, "version must be a positive integer");
	}
	if (input.version > 1 && input.migrate === undefined) {
		throw new SettingsDeclarationError(
			input.id,
			`version ${input.version} needs a migration from earlier versions`,
		);
	}
}

/** Where a field check failed: the declaration and the field key. */
interface FieldLocation {
	readonly declarationId: string;
	readonly key: string;
}

function fieldError(params: { at: FieldLocation; reason: string }): SettingsDeclarationError {
	return new SettingsDeclarationError(
		params.at.declarationId,
		`field "${params.at.key}" ${params.reason}`,
	);
}

function checkField(params: {
	declaration: SettingsDeclarationInput;
	key: string;
	declared: AnyField;
}): void {
	const { declaration, key, declared } = params;
	const at = { declarationId: declaration.id, key };
	if (declared.label === undefined) {
		throw fieldError({ at, reason: "has no label" });
	}
	const group = declared.ui?.group;
	if (group !== undefined && declaration.groups?.[group] === undefined) {
		throw fieldError({ at, reason: `names the undeclared group "${group}"` });
	}
	if (declared.spec.kind === "secret") {
		checkSecret({ at, declared });
	}
	checkSpec({ at, spec: declared.spec });
	if (declared.default !== undefined && !isValidDefault(declared)) {
		throw fieldError({ at, reason: "has a default that fails its own validation" });
	}
}

function isValidDefault(declared: AnyField): boolean {
	return parseFieldValue({ field: declared, value: declared.default }).ok;
}

function checkSecret(params: { at: FieldLocation; declared: AnyField }): void {
	const { at, declared } = params;
	if (declared.default !== undefined) {
		throw fieldError({ at, reason: "is a secret and cannot have a default" });
	}
	if (declared.ui?.examples !== undefined) {
		throw fieldError({ at, reason: "is a secret and cannot have examples" });
	}
}

/** Constraints of one kind, recursing into a list's item. */
function checkSpec(params: { at: FieldLocation; spec: FieldSpec }): void {
	const { at, spec } = params;
	switch (spec.kind) {
		case "enum":
			checkChoiceCount({ at, count: spec.choices.length });
			return;
		case "integer":
			checkStaticSuggestions({ at, suggest: spec.suggest });
			return;
		case "text":
			if ((spec.maxLength ?? 0) > FIELD_LIMITS.textMaxLength) {
				throw fieldError({
					at,
					reason: `allows more than ${FIELD_LIMITS.textMaxLength} characters`,
				});
			}
			checkStaticSuggestions({ at, suggest: spec.suggest });
			return;
		case "list":
			checkList({ at, spec });
			return;
		case "toggles":
			checkToggles({ at, spec });
			return;
		default:
			return;
	}
}

function checkList(params: { at: FieldLocation; spec: FieldSpec & { kind: "list" } }): void {
	const { at, spec } = params;
	if ((spec.maxItems ?? 0) > FIELD_LIMITS.listMaxItems) {
		throw fieldError({ at, reason: `allows more than ${FIELD_LIMITS.listMaxItems} items` });
	}
	const itemKind = spec.item.spec.kind;
	if (!LIST_ITEM_KINDS.includes(itemKind)) {
		throw fieldError({ at, reason: `is a list of ${itemKind}, which lists cannot hold` });
	}
	checkSpec({ at, spec: spec.item.spec });
}

function checkToggles(params: { at: FieldLocation; spec: FieldSpec & { kind: "toggles" } }): void {
	const { at, spec } = params;
	if (new Set(spec.keys).size !== spec.keys.length) {
		throw fieldError({ at, reason: "declares a toggle key more than once" });
	}
	for (const key of Object.keys(spec.keyLabels ?? {})) {
		if (!spec.keys.includes(key)) {
			throw fieldError({ at, reason: `labels the undeclared toggle key "${key}"` });
		}
	}
}

function checkStaticSuggestions(params: {
	at: FieldLocation;
	suggest: Suggestions<unknown> | undefined;
}): void {
	if (params.suggest !== undefined && "choices" in params.suggest) {
		checkChoiceCount({ at: params.at, count: params.suggest.choices.length });
	}
}

function checkChoiceCount(params: { at: FieldLocation; count: number }): void {
	if (params.count < 1 || params.count > FIELD_LIMITS.staticChoices) {
		throw fieldError({
			at: params.at,
			reason: `must have 1 to ${FIELD_LIMITS.staticChoices} choices`,
		});
	}
}
