import { describe, expect, it } from "vitest";
import { defineSettings } from "@/settings/define-settings";
import { displayOrder } from "@/settings/field-order";
import { field } from "@/settings/fields/builders";

describe("displayOrder", () => {
	it("keeps declared order when no hint applies, a group standing at its first field", () => {
		const declaration = defineSettings({
			id: "plain",
			version: 1,
			labels: { title: "plain.title" },
			groups: { b: { label: "plain.b" }, a: { label: "plain.a" }, empty: { label: "plain.e" } },
			fields: {
				one: field.boolean({ label: "plain.one" }),
				two: field.boolean({ label: "plain.two", ui: { group: "a" } }),
				three: field.boolean({ label: "plain.three" }),
				four: field.boolean({ label: "plain.four", ui: { group: "b" } }),
				five: field.boolean({ label: "plain.five", ui: { group: "a" } }),
			},
		});
		expect(displayOrder(declaration)).toStrictEqual({
			groups: ["a", "b", "empty"],
			entries: [
				{ kind: "field", key: "one" },
				{ kind: "group", id: "a", fields: ["two", "five"] },
				{ kind: "field", key: "three" },
				{ kind: "group", id: "b", fields: ["four"] },
			],
		});
	});

	it("ranks groups by ui.groupOrder, then their order, then declared order", () => {
		const declaration = defineSettings({
			id: "ranked",
			version: 1,
			labels: { title: "ranked.title" },
			ui: { groupOrder: ["c"] },
			groups: {
				a: { label: "ranked.a" },
				b: { label: "ranked.b", order: 2 },
				c: { label: "ranked.c", order: 9 },
				d: { label: "ranked.d", order: 1 },
			},
			fields: {
				fa: field.boolean({ label: "ranked.fa", ui: { group: "a" } }),
				fb: field.boolean({ label: "ranked.fb", ui: { group: "b" } }),
				fc: field.boolean({ label: "ranked.fc", ui: { group: "c" } }),
				fd: field.boolean({ label: "ranked.fd", ui: { group: "d" } }),
			},
		});
		const order = displayOrder(declaration);
		expect(order.groups).toStrictEqual(["c", "d", "b", "a"]);
		expect(order.entries.map((entry) => (entry.kind === "group" ? entry.id : entry.key))).toEqual([
			"c",
			"d",
			"b",
			"a",
		]);
	});

	it("ranks fields by ui.order within their group and ungrouped among themselves, stably", () => {
		const declaration = defineSettings({
			id: "fields",
			version: 1,
			labels: { title: "fields.title" },
			groups: { g: { label: "fields.g" } },
			fields: {
				x: field.boolean({ label: "fields.x" }),
				g1: field.boolean({ label: "fields.g1", ui: { group: "g" } }),
				y: field.boolean({ label: "fields.y", ui: { order: 1 } }),
				g2: field.boolean({ label: "fields.g2", ui: { group: "g", order: 2 } }),
				g3: field.boolean({ label: "fields.g3", ui: { group: "g", order: 2 } }),
				g4: field.boolean({ label: "fields.g4", ui: { group: "g", order: 1 } }),
			},
		});
		expect(displayOrder(declaration).entries).toStrictEqual([
			{ kind: "field", key: "y" },
			{ kind: "group", id: "g", fields: ["g4", "g2", "g3", "g1"] },
			{ kind: "field", key: "x" },
		]);
	});

	it("leaves the declaration untouched", () => {
		const declaration = defineSettings({
			id: "frozen",
			version: 1,
			labels: { title: "frozen.title" },
			ui: { groupOrder: ["b", "a"] },
			groups: { a: { label: "frozen.a" }, b: { label: "frozen.b" } },
			fields: {
				f: field.boolean({ label: "frozen.f", ui: { group: "a", order: 2 } }),
				g: field.boolean({ label: "frozen.g", ui: { group: "b", order: 1 } }),
			},
		});
		const before = structuredClone(declaration);
		displayOrder(declaration);
		expect(declaration).toStrictEqual(before);
	});
});
