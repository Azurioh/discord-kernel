import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/errors/business-error";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { SETTINGS_ISSUE_MESSAGES } from "@/settings/messages";
import type { SettingsIssue } from "@/settings/settings-validation-error";
import { validateSettings } from "@/settings/validate";
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

function validatePatch(patch: unknown, guilds = makeDirectory()) {
	return validateSettings({
		declaration: valueCasesSettings,
		guildId: VALUE_CASES_GUILD,
		patch,
		guilds,
	});
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
