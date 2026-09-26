import {
	type DeclarationControl,
	isFreeEntry,
} from "@/discord/components/settings-editor/from-declaration-controls";
import type { SettingsEditorLevel } from "@/discord/components/settings-editor/navigation";
import { MAX_CARD_LEVEL_ENTRIES } from "@/discord/components/settings-editor/settings-editor-card.view";
import {
	MAX_MODAL_COMPONENTS,
	type SettingsEditorField,
} from "@/discord/components/settings-editor/settings-editor-fields";
import { SETTINGS_EDITOR_MESSAGES } from "@/discord/i18n";
import type { SettingsDeclaration } from "@/settings/define-settings";

/** Separates a generated entry key from its number. */
const KEY_SEPARATOR = "#";

/** Prefix of the key of every level the layout nests. */
const LEVEL_KEY_PREFIX = "level";

/** Suffix of the key of the modal a non-strict searchable field outside any group opens. */
const SEARCH_ENTRY_SUFFIX = "search";

/** The screen of a declaration: its root entries, its nested levels, and what each group entry saves. */
export interface DeclarationLayout {
	readonly fields: readonly SettingsEditorField<string>[];
	readonly levels: readonly SettingsEditorLevel<string>[];
	/** The controls of each group entry, by the entry's key. */
	readonly groups: ReadonlyMap<string, readonly DeclarationControl[]>;
}

/**
 * One place on a level, in declared order: a control of its own, or a
 * declared group already split into modals of at most
 * {@link MAX_MODAL_COMPONENTS} controls.
 */
type Section =
	| { readonly kind: "control"; readonly control: DeclarationControl }
	| {
			readonly kind: "group";
			readonly labelKey: string;
			readonly hintKey: string;
			readonly chunks: readonly SettingsEditorField<string>[];
	  };

/**
 * Lay the controls of a declaration out on the screen, keeping their order
 * (the display order of `@/settings/field-order`): a control outside any group is an entry of its own; a group stands
 * where its first control stands, split into entries of at most
 * {@link MAX_MODAL_COMPONENTS} controls (one modal each). A level holds at
 * most {@link MAX_CARD_LEVEL_ENTRIES} entries: past that, a group split over
 * several entries moves into a level of its own, then the entries past the
 * last that fits move behind a "more settings" level.
 *
 * A non-strict searchable field's select and its free entry are never split:
 * outside any group they form a modal of their own, named after the field;
 * inside a group they share one of its modals.
 *
 * @param params.declaration - the module's settings declaration, for its groups.
 * @param params.controls - the controls of the declaration, in declared order.
 * @returns the root entries, the nested levels and each group entry's controls.
 */
export function layoutDeclaration(params: {
	declaration: SettingsDeclaration;
	controls: readonly DeclarationControl[];
}): DeclarationLayout {
	const groups = new Map<string, readonly DeclarationControl[]>();
	const sections = declarationSections({ ...params, groups });
	const levels: SettingsEditorLevel<string>[] = [];
	const flat = sections.flatMap(sectionEntries);
	const fields =
		flat.length <= MAX_CARD_LEVEL_ENTRIES
			? flat
			: paged({
					entries: sections.flatMap((section) => foldedEntries({ section, levels })),
					levels,
				});
	return { fields, levels, groups };
}

/** The sections of the root level, recording each group entry's controls in `groups`. */
function declarationSections(params: {
	declaration: SettingsDeclaration;
	controls: readonly DeclarationControl[];
	groups: Map<string, readonly DeclarationControl[]>;
}): Section[] {
	const { declaration, controls, groups } = params;
	const sections: Section[] = [];
	const seenGroups = new Set<string>();
	const units = controlUnits(controls);
	for (const unit of units) {
		const [first] = unit;
		if (first === undefined) {
			continue;
		}
		const { groupId } = first;
		if (groupId === undefined) {
			sections.push(
				unit.length === 1 ? { kind: "control", control: first } : searchSection({ unit, groups }),
			);
		} else if (!seenGroups.has(groupId)) {
			seenGroups.add(groupId);
			sections.push(groupSection({ declaration, units, groups, groupId }));
		}
	}
	return sections;
}

/**
 * The controls in order, a non-strict searchable field's select and free
 * entry kept together as one unit, every other control a unit of its own.
 */
function controlUnits(controls: readonly DeclarationControl[]): DeclarationControl[][] {
	const units: DeclarationControl[][] = [];
	for (const control of controls) {
		const last = units.at(-1);
		if (isFreeEntry(control) && last?.[0]?.fieldKey === control.fieldKey) {
			last.push(control);
		} else {
			units.push([control]);
		}
	}
	return units;
}

/** A non-strict searchable field outside any group: one modal holding its select and free entry. */
function searchSection(params: {
	unit: readonly DeclarationControl[];
	groups: Map<string, readonly DeclarationControl[]>;
}): Section {
	const { unit, groups } = params;
	const [{ entry, fieldKey }] = unit as [DeclarationControl];
	const key = `${fieldKey}${KEY_SEPARATOR}${SEARCH_ENTRY_SUFFIX}`;
	groups.set(key, unit);
	const { labelKey, hintKey } = entry;
	return {
		kind: "group",
		labelKey,
		hintKey,
		chunks: [{ kind: "group", key, labelKey, hintKey, fields: unit.map(controlEntry) }],
	};
}

/** A declared group split into entries of at most {@link MAX_MODAL_COMPONENTS} controls, no unit split. */
function groupSection(params: {
	declaration: SettingsDeclaration;
	units: readonly (readonly DeclarationControl[])[];
	groups: Map<string, readonly DeclarationControl[]>;
	groupId: string;
}): Section {
	const { declaration, units, groups, groupId } = params;
	const group = declaration.groups?.[groupId];
	const labelKey = group?.label ?? groupId;
	const hintKey = group?.description ?? SETTINGS_EDITOR_MESSAGES.entryHint;
	const members = units.filter((unit) => unit[0]?.groupId === groupId);
	const chunks: SettingsEditorField<string>[] = [];
	for (const [index, chunk] of packed(members, MAX_MODAL_COMPONENTS).entries()) {
		const key = `${groupId}${KEY_SEPARATOR}${index + 1}`;
		groups.set(key, chunk);
		chunks.push({ kind: "group", key, labelKey, hintKey, fields: chunk.map(controlEntry) });
	}
	return { kind: "group", labelKey, hintKey, chunks };
}

/**
 * `units` packed in order into chunks of at most `size` controls, a unit
 * never split: one that does not fit starts the next chunk.
 */
function packed(
	units: readonly (readonly DeclarationControl[])[],
	size: number,
): DeclarationControl[][] {
	const chunks: DeclarationControl[][] = [];
	for (const unit of units) {
		const last = chunks.at(-1);
		if (last !== undefined && last.length + unit.length <= size) {
			last.push(...unit);
		} else {
			chunks.push([...unit]);
		}
	}
	return chunks;
}

function controlEntry(control: DeclarationControl): DeclarationControl["entry"] {
	return control.entry;
}

/** The entries a section stands for on a level of its own. */
function sectionEntries(section: Section): readonly SettingsEditorField<string>[] {
	return section.kind === "control" ? [section.control.entry] : section.chunks;
}

/** A section's entries once a group split over several entries moves into a level of its own. */
function foldedEntries(params: {
	section: Section;
	levels: SettingsEditorLevel<string>[];
}): readonly SettingsEditorField<string>[] {
	const { section, levels } = params;
	if (section.kind === "control" || section.chunks.length === 1) {
		return sectionEntries(section);
	}
	return [
		nestedLevel({
			labelKey: section.labelKey,
			hintKey: section.hintKey,
			entries: section.chunks,
			levels,
		}),
	];
}

/**
 * `entries` within {@link MAX_CARD_LEVEL_ENTRIES}: all of them when they fit,
 * otherwise those before the last place, then a "more settings" level holding
 * the rest.
 */
function paged(params: {
	entries: readonly SettingsEditorField<string>[];
	levels: SettingsEditorLevel<string>[];
}): readonly SettingsEditorField<string>[] {
	const { entries, levels } = params;
	if (entries.length <= MAX_CARD_LEVEL_ENTRIES) {
		return entries;
	}
	const kept = MAX_CARD_LEVEL_ENTRIES - 1;
	const more = nestedLevel({
		labelKey: SETTINGS_EDITOR_MESSAGES.moreEntries,
		hintKey: SETTINGS_EDITOR_MESSAGES.moreEntriesHint,
		entries: entries.slice(kept),
		levels,
	});
	return [...entries.slice(0, kept), more];
}

/** Add a level holding `entries` (paged to fit) and return the entry that opens it. */
function nestedLevel(params: {
	labelKey: string;
	hintKey: string;
	entries: readonly SettingsEditorField<string>[];
	levels: SettingsEditorLevel<string>[];
}): SettingsEditorField<string> {
	const { labelKey, hintKey, levels } = params;
	const fields = paged({ entries: params.entries, levels });
	const key = `${LEVEL_KEY_PREFIX}${KEY_SEPARATOR}${levels.length + 1}`;
	levels.push({ key, titleKey: labelKey, fields });
	return { kind: "level", key, levelKey: key, labelKey, hintKey };
}
