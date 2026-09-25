import type { SettingsDeclaration } from "@/settings/define-settings";

/** Rank of an item no hint places: after every ranked one. */
const UNRANKED = Number.MAX_SAFE_INTEGER;

/** One place on a settings screen: a field of its own, or a group with its fields in order. */
type DisplayEntry =
	| { readonly kind: "field"; readonly key: string }
	| { readonly kind: "group"; readonly id: string; readonly fields: readonly string[] };

/** The display order of a declaration. */
export interface DisplayOrder {
	/** Every declared group, fields or not, ranked. */
	readonly groups: readonly string[];
	/** The screen's places, top to bottom: ungrouped fields and groups holding fields. */
	readonly entries: readonly DisplayEntry[];
}

/** An item and the keys it sorts by, compared left to right. */
interface Ranked<T> {
	readonly item: T;
	readonly keys: readonly number[];
}

/**
 * The order every surface shows a declaration in.
 *
 * - Groups rank by their position in `ui.groupOrder` (unlisted ones after
 *   listed ones), then by their own `order` (none after any), then by where
 *   they stand in declared order: at their first field, or after every field
 *   for a group with no field, in declaration order.
 * - Fields rank within their group, and ungrouped fields among themselves,
 *   by `ui.order` (none after any), then by declaration order.
 * - On screen, each place is kept by its kind: a group stands where a group's
 *   first field is declared and an ungrouped field where an ungrouped field
 *   is declared, then the ranked groups fill the group places and the ranked
 *   ungrouped fields the field places. With no hint this is declared order.
 *
 * @param declaration - the module's settings declaration; left untouched.
 * @returns every declared group ranked, and the screen's places in order.
 */
export function displayOrder(declaration: SettingsDeclaration): DisplayOrder {
	const fieldKeys = Object.keys(declaration.fields);
	const slots: ("field" | "group")[] = [];
	const firstField = new Map<string, number>();
	const members = new Map<string, Ranked<string>[]>();
	const loose: Ranked<string>[] = [];
	fieldKeys.forEach((key, index) => {
		const ui = declaration.fields[key]?.ui;
		const ranked: Ranked<string> = { item: key, keys: [ui?.order ?? UNRANKED, index] };
		const groupId = ui?.group;
		if (groupId === undefined) {
			slots.push("field");
			loose.push(ranked);
			return;
		}
		if (!firstField.has(groupId)) {
			firstField.set(groupId, index);
			slots.push("group");
		}
		members.set(groupId, [...(members.get(groupId) ?? []), ranked]);
	});
	const groups = rankedGroups({ declaration, firstField, fieldCount: fieldKeys.length });
	const filledGroups = groups.filter((id) => members.has(id));
	const fields = sortedItems(loose);
	let nextGroup = 0;
	let nextField = 0;
	const entries = slots.map((slot): DisplayEntry => {
		switch (slot) {
			case "field": {
				const key = fields[nextField] ?? "";
				nextField += 1;
				return { kind: "field", key };
			}
			case "group": {
				const id = filledGroups[nextGroup] ?? "";
				nextGroup += 1;
				return { kind: "group", id, fields: sortedItems(members.get(id) ?? []) };
			}
			default:
				return unhandledSlot(slot);
		}
	});
	return { groups, entries };
}

/** Every declared group id, ranked. */
function rankedGroups(params: {
	declaration: SettingsDeclaration;
	firstField: ReadonlyMap<string, number>;
	fieldCount: number;
}): string[] {
	const { declaration, firstField, fieldCount } = params;
	const groupOrder = declaration.ui?.groupOrder ?? [];
	const ranked = Object.entries(declaration.groups ?? {}).map(
		([id, group], index): Ranked<string> => {
			const position = groupOrder.indexOf(id);
			return {
				item: id,
				keys: [
					position === -1 ? UNRANKED : position,
					group.order ?? UNRANKED,
					firstField.get(id) ?? fieldCount + index,
				],
			};
		},
	);
	return sortedItems(ranked);
}

/** The items sorted by their keys, on a copy. */
function sortedItems<T>(ranked: readonly Ranked<T>[]): T[] {
	return [...ranked].sort(compareRanked).map((entry) => entry.item);
}

function compareRanked<T>(left: Ranked<T>, right: Ranked<T>): number {
	for (const [index, key] of left.keys.entries()) {
		const other = right.keys[index] ?? UNRANKED;
		if (key !== other) {
			return key < other ? -1 : 1;
		}
	}
	return 0;
}

function unhandledSlot(slot: never): never {
	throw new Error(`Unhandled display slot: ${String(slot)}`);
}
