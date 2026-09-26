import { afterEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/errors/business-error";
import type { Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";
import type { Choice } from "@/settings/choice";
import { defineSettings } from "@/settings/define-settings";
import { field } from "@/settings/fields/builders";
import type { SuggestionContext } from "@/settings/fields/field";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { SETTINGS_ISSUE_MESSAGES } from "@/settings/messages";
import type { GuildDirectory } from "@/settings/ports/guild-directory";
import type { SettingsIssue } from "@/settings/settings-validation-error";
import { SUGGESTION_TIMEOUT_MS } from "@/settings/timed-search";
import { type ValidationScope, validateSettings } from "@/settings/validate";
import { createFakeLogger } from "../support/fake-logger";
import {
	DELETED_CHANNEL,
	DELETED_ROLE,
	type ExpectedIssue,
	MEMBER,
	ROLE_A,
	TEXT_CHANNEL,
	VALUE_CASES,
	VALUE_CASES_DIRECTORY_SEED,
	VALUE_CASES_GUILD,
	VOICE_CHANNEL,
	valueCasesSettings,
} from "./fixtures/value-cases";

function makeDirectory() {
	return createInMemoryGuildDirectory(VALUE_CASES_DIRECTORY_SEED);
}

const USER = "400000000000000001";

/** What stage 2 reads: the directory given, and ports no value case needs. */
function scopeOf(
	guilds: GuildDirectory,
	overrides: Partial<ValidationScope> = {},
): ValidationScope & { readonly logger: Logger } {
	const logger = createFakeLogger();
	return {
		ports: { guilds, translator: {} as Translator, logger },
		guildId: VALUE_CASES_GUILD,
		userId: USER,
		locale: "en",
		currentValues: async () => ({}),
		...overrides,
		logger,
	};
}

function validatePatch(patch: unknown, guilds = makeDirectory()) {
	return validateSettings({ declaration: valueCasesSettings, patch, scope: scopeOf(guilds) });
}

function toIssue(expected: ExpectedIssue): SettingsIssue {
	const key = SETTINGS_ISSUE_MESSAGES[expected.code];
	return {
		field: expected.field,
		code: expected.code,
		translation: expected.params === undefined ? { key } : { key, params: expected.params },
	};
}

describe("validateSettings", () => {
	describe("value table", () => {
		it.each(
			VALUE_CASES.map((valueCase) => ({
				...valueCase,
				title: `${valueCase.kind} ${valueCase.key} = ${JSON.stringify(valueCase.value)}`,
			})),
		)("$title", async ({ kind, key, value, expected }) => {
			expect(valueCasesSettings.fields[key].spec.kind).toBe(kind);

			const result = await validatePatch({ [key]: value });

			if (expected.ok) {
				expect(result).toStrictEqual({ ok: true, values: { [key]: expected.stored } });
			} else {
				expect(result).toStrictEqual({ ok: false, issues: expected.issues.map(toIssue) });
			}
		});
	});

	it("returns only the submitted fields, in their stored form", async () => {
		const result = await validatePatch({ accent: "#ABC", cooldown: "1h", enabled: false });

		expect(result).toStrictEqual({
			ok: true,
			values: { accent: "#aabbcc", cooldown: 3600, enabled: false },
		});
	});

	it("runs guild checks only on fields that passed their own validation", async () => {
		const guilds = makeDirectory();
		const channel = vi.spyOn(guilds, "channel");
		const role = vi.spyOn(guilds, "role");

		await validatePatch(
			{ logChannel: "general", watchedChannels: [TEXT_CHANNEL, TEXT_CHANNEL], staffRole: ROLE_A },
			guilds,
		);

		expect(channel).not.toHaveBeenCalled();
		expect(role).toHaveBeenCalledExactlyOnceWith(VALUE_CASES_GUILD, ROLE_A);
	});

	it("reports a deleted channel as notFound", async () => {
		const result = await validatePatch({ logChannel: DELETED_CHANNEL });

		expect(result).toStrictEqual({
			ok: false,
			issues: [toIssue({ field: "logChannel", code: "notFound" })],
		});
	});

	it("reports a channel of a type the field does not allow as channelType", async () => {
		const result = await validatePatch({ logChannel: VOICE_CHANNEL });

		expect(result).toStrictEqual({
			ok: false,
			issues: [toIssue({ field: "logChannel", code: "channelType" })],
		});
	});

	it("reports keys the declaration does not have as unknownField", async () => {
		const result = await validatePatch({ bogus: 1, toString: "x" });

		expect(result).toStrictEqual({
			ok: false,
			issues: [
				toIssue({ field: "bogus", code: "unknownField" }),
				toIssue({ field: "toString", code: "unknownField" }),
			],
		});
	});

	it.each([null, undefined, "logChannel", 42, [TEXT_CHANNEL]])(
		"throws a ValidationError on a patch that is not an object: %j",
		async (patch) => {
			await expect(validatePatch(patch)).rejects.toBeInstanceOf(ValidationError);
		},
	);

	it("reports every issue of a submission together, in submission order", async () => {
		const result = await validatePatch({
			maxOpen: 9,
			owner: MEMBER,
			bogus: true,
			pingRoles: [ROLE_A, DELETED_ROLE],
			logChannel: VOICE_CHANNEL,
			keywords: null,
			thresholds: [0, 1, 1],
		});

		expect(result).toStrictEqual({
			ok: false,
			issues: [
				toIssue({ field: "maxOpen", code: "max", params: { max: 5 } }),
				toIssue({ field: "bogus", code: "unknownField" }),
				toIssue({ field: "pingRoles[1]", code: "notFound" }),
				toIssue({ field: "logChannel", code: "channelType" }),
				toIssue({ field: "keywords", code: "required" }),
				toIssue({ field: "thresholds[0]", code: "min", params: { min: 1 } }),
				toIssue({ field: "thresholds[2]", code: "duplicate" }),
			],
		});
	});
});

describe("validateSettings, strict searchable fields (S10)", () => {
	const TIMEZONES: readonly Choice[] = [
		{ name: "Paris", value: "Europe/Paris" },
		{ name: "Tokyo", value: "Asia/Tokyo" },
	];

	/** A search over {@link TIMEZONES} by name or value prefix. */
	async function searchZones(query: string): Promise<readonly Choice[]> {
		return TIMEZONES.filter(
			(zone) => String(zone.value).startsWith(query) || zone.name.startsWith(query),
		);
	}

	function strictSettings(search: {
		resolve: (query: string, ctx: SuggestionContext) => Promise<readonly Choice[]>;
		label?: (value: string, ctx: SuggestionContext) => Promise<string | undefined>;
		strict?: boolean;
	}) {
		return defineSettings({
			id: "strict",
			version: 1,
			labels: { title: "strict.title" },
			fields: {
				timezone: field.text({ label: "strict.timezone", suggest: search }),
				zones: field.list(field.text({ suggest: search }), { label: "strict.zones" }),
				region: field.text({ label: "strict.region" }),
				apiKey: field.secret({ label: "strict.api-key" }),
			},
		});
	}

	function validateStrict(
		declaration: ReturnType<typeof strictSettings>,
		patch: Record<string, unknown>,
		overrides: Partial<ValidationScope> = {},
	) {
		const scope = scopeOf(makeDirectory(), overrides);
		return { scope, result: validateSettings({ declaration, patch, scope }) };
	}

	afterEach(() => {
		vi.useRealTimers();
	});

	it("accepts a value the search's label names, and refuses one it does not as unknownChoice", async () => {
		const label = vi.fn(
			async (value: string) => TIMEZONES.find((zone) => zone.value === value)?.name,
		);
		const declaration = strictSettings({ resolve: searchZones, label, strict: true });

		await expect(
			validateStrict(declaration, { timezone: "Asia/Tokyo" }).result,
		).resolves.toStrictEqual({ ok: true, values: { timezone: "Asia/Tokyo" } });
		await expect(
			validateStrict(declaration, { timezone: "Mars/Olympus" }).result,
		).resolves.toStrictEqual({
			ok: false,
			issues: [toIssue({ field: "timezone", code: "unknownChoice" })],
		});
	});

	it("without a label, accepts only an exact value among the results for that value", async () => {
		const resolve = vi.fn(searchZones);
		const declaration = strictSettings({ resolve, strict: true });

		await expect(
			validateStrict(declaration, { timezone: "Europe/Paris" }).result,
		).resolves.toMatchObject({ ok: true });
		expect(resolve).toHaveBeenCalledWith("Europe/Paris", expect.anything());
		// A prefix is a result of the search, never the value itself.
		await expect(validateStrict(declaration, { timezone: "Europe" }).result).resolves.toMatchObject(
			{ ok: false, issues: [{ field: "timezone", code: "unknownChoice" }] },
		);
	});

	it("checks each item of a list of a strict field", async () => {
		const declaration = strictSettings({ resolve: searchZones, strict: true });

		await expect(
			validateStrict(declaration, { zones: ["Asia/Tokyo", "Mars/Olympus"] }).result,
		).resolves.toStrictEqual({
			ok: false,
			issues: [toIssue({ field: "zones[1]", code: "unknownChoice" })],
		});
	});

	it("accepts any value of a search that is not strict", async () => {
		const resolve = vi.fn(searchZones);
		const declaration = strictSettings({ resolve });

		await expect(
			validateStrict(declaration, { timezone: "Mars/Olympus" }).result,
		).resolves.toStrictEqual({ ok: true, values: { timezone: "Mars/Olympus" } });
		expect(resolve).not.toHaveBeenCalled();
	});

	it("hands the search the requester and the other values, current ones under submitted ones, secrets left out", async () => {
		const resolve = vi.fn(searchZones);
		const declaration = strictSettings({ resolve, strict: true });

		await validateStrict(
			declaration,
			{ timezone: "Asia/Tokyo", region: "asia", apiKey: "hunter2" },
			{ locale: "fr", currentValues: async () => ({ region: "eu", zones: ["Europe/Paris"] }) },
		).result;

		expect(resolve).toHaveBeenCalledWith("Asia/Tokyo", {
			guildId: VALUE_CASES_GUILD,
			userId: USER,
			locale: "fr",
			values: { region: "asia", zones: ["Europe/Paris"] },
		});
	});

	it("refuses the value, and logs, when the strict search throws", async () => {
		const declaration = strictSettings({
			resolve: async () => {
				throw new Error("backend down");
			},
			strict: true,
		});
		const { scope, result } = validateStrict(declaration, { timezone: "Asia/Tokyo" });

		await expect(result).resolves.toMatchObject({
			ok: false,
			issues: [{ field: "timezone", code: "unknownChoice" }],
		});
		expect(scope.logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ moduleId: "strict", field: "timezone", err: "backend down" }),
			expect.any(String),
		);
	});

	it("refuses the value, and logs, when the strict search runs past its budget", async () => {
		vi.useFakeTimers();
		const declaration = strictSettings({
			resolve: () => new Promise((resolve) => setTimeout(() => resolve(TIMEZONES), 3_000)),
			strict: true,
		});
		const { scope, result } = validateStrict(declaration, { timezone: "Asia/Tokyo" });

		await vi.advanceTimersByTimeAsync(SUGGESTION_TIMEOUT_MS);

		await expect(result).resolves.toMatchObject({
			ok: false,
			issues: [{ field: "timezone", code: "unknownChoice" }],
		});
		expect(scope.logger.warn).toHaveBeenCalledOnce();
	});

	it("never asks the search about a value its own validation already refused", async () => {
		const resolve = vi.fn(searchZones);
		const declaration = strictSettings({ resolve, strict: true });

		await expect(validateStrict(declaration, { timezone: 42 }).result).resolves.toMatchObject({
			ok: false,
			issues: [{ field: "timezone", code: "type" }],
		});
		expect(resolve).not.toHaveBeenCalled();
	});
});
