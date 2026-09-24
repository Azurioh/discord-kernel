import { ChannelType } from "discord.js";
import { describe, expect, it } from "vitest";
import { openToAnyone } from "@/discord/components/component-router";
import {
	createChannelSelect,
	createRoleSelect,
	createSelectHandler,
	createSelectRow,
	createStringSelect,
	createUserSelect,
} from "@/discord/interaction/select-menu";

interface SelectJson {
	custom_id: string;
	placeholder?: string;
	min_values?: number;
	max_values?: number;
	disabled?: boolean;
	options?: { label: string; value: string }[];
	channel_types?: number[];
	default_values?: { id: string; type: string }[];
}

describe("createStringSelect", () => {
	it("carries its id, layout and options", () => {
		const menu = createStringSelect({
			id: "pick-colour",
			placeholder: "Choose",
			minValues: 1,
			maxValues: 2,
			options: [
				{ label: "Red", value: "red" },
				{ label: "Blue", value: "blue" },
			],
		});

		const json = menu.apply().toJSON() as SelectJson;

		expect(json.custom_id).toBe("pick-colour");
		expect(json.placeholder).toBe("Choose");
		expect(json.min_values).toBe(1);
		expect(json.max_values).toBe(2);
		expect(json.options?.map((option) => option.value)).toEqual(["red", "blue"]);
	});

	// A rendered-disabled menu is how a flow freezes its own message after use.
	it("can be force-disabled at render time", () => {
		const menu = createStringSelect({ id: "pick", options: [{ label: "One", value: "1" }] });

		expect((menu.apply(true).toJSON() as SelectJson).disabled).toBe(true);
		expect((menu.apply().toJSON() as SelectJson).disabled).toBe(false);
	});

	it("keeps the handler alongside the builder", () => {
		const menu = createStringSelect({
			id: "pick",
			options: [{ label: "One", value: "1" }],
			onSelect: async () => undefined,
		});

		expect(menu.onSelect).toBeTypeOf("function");
	});
});

describe("createChannelSelect", () => {
	it("filters the offered channels by type", () => {
		const menu = createChannelSelect({
			id: "pick-hub",
			channelTypes: [ChannelType.GuildVoice],
		});

		expect((menu.apply().toJSON() as SelectJson).channel_types).toEqual([ChannelType.GuildVoice]);
	});

	it("offers every channel when no filter is declared", () => {
		const menu = createChannelSelect({ id: "pick-any" });

		expect((menu.apply().toJSON() as SelectJson).channel_types).toBeUndefined();
	});
});

describe("createRoleSelect", () => {
	it("carries its id and layout", () => {
		const menu = createRoleSelect({ id: "pick-role", placeholder: "Role?" });
		const json = menu.apply().toJSON() as SelectJson;

		expect(json.custom_id).toBe("pick-role");
		expect(json.placeholder).toBe("Role?");
	});
});

describe("createUserSelect", () => {
	it("carries its id and layout", () => {
		const menu = createUserSelect({ id: "pick-user", placeholder: "Who?", maxValues: 5 });
		const json = menu.apply().toJSON() as SelectJson;

		expect(json.custom_id).toBe("pick-user");
		expect(json.placeholder).toBe("Who?");
		expect(json.max_values).toBe(5);
	});

	/**
	 * A picker returns its whole selection, never a delta, so one opening empty
	 * over a list that already has members drops whoever is not re-picked.
	 */
	it("opens already holding the members it is about to replace", () => {
		const menu = createUserSelect({ id: "pick-user", defaultUserIds: ["user-1", "user-2"] });

		expect((menu.apply().toJSON() as SelectJson).default_values?.map((value) => value.id)).toEqual([
			"user-1",
			"user-2",
		]);
	});

	it("opens empty when nothing is held yet", () => {
		const menu = createUserSelect({ id: "pick-user", defaultUserIds: [] });

		expect((menu.apply().toJSON() as SelectJson).default_values).toBeUndefined();
	});
});

describe("createSelectRow", () => {
	it("wraps a menu in its own action row", () => {
		const menu = createRoleSelect({ id: "pick-role" });
		const row = createSelectRow(menu).toJSON() as { components: SelectJson[] };

		expect(row.components).toHaveLength(1);
		expect(row.components[0]?.custom_id).toBe("pick-role");
	});
});

describe("createSelectHandler", () => {
	const runtime = { presenter: {}, logger: {} } as never;

	// Without this bridge a declared `onSelect` never runs: the router dispatches
	// to a ComponentHandler, and nothing else maps an interaction back to a menu.
	it("invokes onSelect with the picked values", async () => {
		const seen: string[][] = [];
		const menu = createStringSelect({
			id: "pick",
			options: [{ label: "One", value: "1" }],
			onSelect: async (ctx) => {
				seen.push([...ctx.values]);
			},
		});
		const handler = createSelectHandler(menu, openToAnyone("test double"));
		const interaction = {
			values: ["1"],
			isAnySelectMenu: () => true,
		} as never;

		expect(handler.customId).toBe("pick");
		await handler.handle(interaction, runtime);

		expect(seen).toEqual([["1"]]);
	});

	it("ignores an interaction that is not a select menu", async () => {
		let called = false;
		const menu = createRoleSelect({
			id: "pick-role",
			onSelect: async () => {
				called = true;
			},
		});
		const interaction = { isAnySelectMenu: () => false } as never;

		await createSelectHandler(menu, openToAnyone("test double")).handle(interaction, runtime);

		expect(called).toBe(false);
	});
});
