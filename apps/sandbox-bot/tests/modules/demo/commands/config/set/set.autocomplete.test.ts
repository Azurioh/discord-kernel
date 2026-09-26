import type { Choice, SettingsService } from "@azurioh/discord-kernel/settings";
import type { AutocompleteInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { createSettingValueAutocomplete } from "@/modules/demo/commands/config/set/set.autocomplete";
import { demoSettings } from "@/modules/demo/settings/demo.settings";

const GUILD = "100000000000000001";
const ROLE = "300000000000000001";

/** A service whose suggestions are `choices`, recording what it was asked. */
function createService(choices: readonly Choice[]) {
	const suggest = vi.fn(async () => choices);
	const service = {
		getForSurface: vi.fn(async () => ({ mode: "strict" })),
		suggest,
	} as unknown as SettingsService;
	return { service, suggest };
}

/** A member typing `typed` in `value` after picking `key`, with a French client. */
function request(params: { key: string | null; typed: string; guildId?: string | null }) {
	return {
		guildId: params.guildId === undefined ? GUILD : params.guildId,
		locale: "fr",
		guildLocale: null,
		user: { id: "admin" },
		options: {
			getString: (name: string) => (name === "key" ? params.key : null),
			getFocused: () => params.typed,
		},
	} as unknown as AutocompleteInteraction;
}

const translator = { defaultLocale: "en" } as never;

describe("createSettingValueAutocomplete", () => {
	it("returns the service's suggestions for the picked key, asked in the member's language", async () => {
		const { service, suggest } = createService([{ name: "Asia · Tokyo", value: "Asia/Tokyo" }]);
		const resolve = createSettingValueAutocomplete(() => service, translator);

		const choices = await resolve(request({ key: "timezone", typed: "tok" }));

		expect(choices).toStrictEqual([{ name: "Asia · Tokyo", value: "Asia/Tokyo" }]);
		expect(suggest).toHaveBeenCalledWith(demoSettings, "timezone", "tok", {
			guildId: GUILD,
			userId: "admin",
			locale: "fr",
			values: { mode: "strict" },
		});
	});

	it("sends an item of a list field as the one-item JSON list /config set parses", async () => {
		const { service } = createService([{ name: "Staff", value: ROLE }]);
		const resolve = createSettingValueAutocomplete(() => service, translator);

		const choices = await resolve(request({ key: "pingRoles", typed: "" }));

		expect(choices).toStrictEqual([{ name: "Staff", value: `["${ROLE}"]` }]);
	});

	it.each([
		["no key picked yet", { key: null, typed: "" }],
		["an undeclared key", { key: "nope", typed: "" }],
		["outside a guild", { key: "timezone", typed: "", guildId: null }],
	])("suggests nothing for %s", async (_title, params) => {
		const { service, suggest } = createService([{ name: "x", value: "x" }]);
		const resolve = createSettingValueAutocomplete(() => service, translator);

		await expect(resolve(request(params))).resolves.toStrictEqual([]);
		expect(suggest).not.toHaveBeenCalled();
	});
});
