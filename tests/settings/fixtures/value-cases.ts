import { defineSettings } from "@/settings/define-settings";
import { type FieldKind, field } from "@/settings/fields";
import type { GuildDirectorySeed } from "@/settings/in-memory/in-memory-guild-directory";
import type { SettingsIssueCode } from "@/settings/settings-validation-error";
import { sampleSettings } from "./sample-declaration";

export const VALUE_CASES_GUILD = "100000000000000001";

export const TEXT_CHANNEL = "200000000000000001";
const ANNOUNCEMENT_CHANNEL = "200000000000000002";
export const VOICE_CHANNEL = "200000000000000003";
/** A well-formed channel id the guild does not have (deleted channel). */
export const DELETED_CHANNEL = "200000000000000099";

export const ROLE_A = "300000000000000001";
const ROLE_B = "300000000000000002";
export const DELETED_ROLE = "300000000000000099";

export const MEMBER = "400000000000000001";
const DELETED_MEMBER = "400000000000000099";

/** Guild contents every case is validated against. */
export const VALUE_CASES_DIRECTORY_SEED: GuildDirectorySeed = {
	[VALUE_CASES_GUILD]: {
		channels: [
			{ id: TEXT_CHANNEL, name: "general", kind: "text" },
			{ id: ANNOUNCEMENT_CHANNEL, name: "news", kind: "announcement" },
			{ id: VOICE_CHANNEL, name: "lounge", kind: "voice" },
		],
		roles: [
			{ id: ROLE_A, name: "Staff" },
			{ id: ROLE_B, name: "Helper" },
		],
		members: [{ id: MEMBER, name: "Alice" }],
	},
};

/**
 * The sample declaration plus the constraints it does not exercise (a minimum
 * text length, a minimum list size), so every issue code has a case.
 */
export const valueCasesSettings = defineSettings({
	...sampleSettings,
	id: "value-cases",
	fields: {
		...sampleSettings.fields,
		nickname: field.text({ label: "value-cases.settings.nickname", minLength: 2 }),
		moderators: field.list(field.role(), {
			label: "value-cases.settings.moderators",
			minItems: 1,
		}),
	},
});

type ValueCaseKey = keyof typeof valueCasesSettings.fields;

/** One issue a rejected value must produce. */
export interface ExpectedIssue {
	/** Field key, `key[index]` for a list item, or `key.name` for a toggle. */
	readonly field: string;
	readonly code: SettingsIssueCode;
	/** `{ min }` or `{ max }` for bound codes; absent otherwise. */
	readonly params?: Readonly<Record<string, number>>;
}

/**
 * One value submitted for one field of {@link valueCasesSettings}, on
 * {@link VALUE_CASES_GUILD} seeded with {@link VALUE_CASES_DIRECTORY_SEED}.
 * Accepted values state their stored form; rejected ones every issue, in order.
 */
export interface ValueCase {
	readonly kind: FieldKind;
	readonly key: ValueCaseKey;
	readonly value: unknown;
	readonly expected:
		| { readonly ok: true; readonly stored: unknown }
		| { readonly ok: false; readonly issues: readonly ExpectedIssue[] };
}

function accepts(kind: FieldKind, key: ValueCaseKey, value: unknown, stored = value): ValueCase {
	return { kind, key, value, expected: { ok: true, stored } };
}

/** `null` unsets an optional or defaulted field: accepted, stored as `undefined`. */
function unsets(kind: FieldKind, key: ValueCaseKey): ValueCase {
	return { kind, key, value: null, expected: { ok: true, stored: undefined } };
}

function rejects(
	kind: FieldKind,
	key: ValueCaseKey,
	value: unknown,
	...issues: readonly ExpectedIssue[]
): ValueCase {
	return { kind, key, value, expected: { ok: false, issues } };
}

function snowflakes(count: number, prefix: string): string[] {
	return Array.from({ length: count }, (_, index) => `${prefix}${String(index).padStart(3, "0")}`);
}

/**
 * Valid and invalid values per field kind with their expected outcome. Every
 * surface (the service and the Discord adapter) must agree on each row (SC-002).
 */
export const VALUE_CASES: readonly ValueCase[] = [
	accepts("channel", "logChannel", TEXT_CHANNEL),
	accepts("channel", "logChannel", ANNOUNCEMENT_CHANNEL),
	rejects("channel", "logChannel", VOICE_CHANNEL, { field: "logChannel", code: "channelType" }),
	rejects("channel", "logChannel", DELETED_CHANNEL, { field: "logChannel", code: "notFound" }),
	rejects("channel", "logChannel", "general", { field: "logChannel", code: "type" }),
	rejects("channel", "logChannel", 123, { field: "logChannel", code: "type" }),
	rejects("channel", "logChannel", null, { field: "logChannel", code: "required" }),

	accepts("role", "staffRole", ROLE_A),
	unsets("role", "staffRole"),
	rejects("role", "staffRole", DELETED_ROLE, { field: "staffRole", code: "notFound" }),
	rejects("role", "staffRole", "staff", { field: "staffRole", code: "type" }),

	accepts("user", "owner", MEMBER),
	rejects("user", "owner", DELETED_MEMBER, { field: "owner", code: "notFound" }),
	rejects("user", "owner", true, { field: "owner", code: "type" }),

	accepts("color", "accent", "#FF0000", "#ff0000"),
	accepts("color", "accent", "#abc", "#aabbcc"),
	unsets("color", "accent"),
	rejects("color", "accent", "not a colour", { field: "accent", code: "type" }),
	rejects("color", "accent", 0xff0000, { field: "accent", code: "type" }),

	accepts("duration", "cooldown", "15m", 900),
	accepts("duration", "cooldown", 120),
	rejects("duration", "cooldown", "30s", { field: "cooldown", code: "min", params: { min: 60 } }),
	rejects("duration", "cooldown", "2d", {
		field: "cooldown",
		code: "max",
		params: { max: 86_400 },
	}),
	rejects("duration", "cooldown", "soon", { field: "cooldown", code: "type" }),
	rejects("duration", "cooldown", 90.5, { field: "cooldown", code: "type" }),

	accepts("enum", "region", "na"),
	rejects("enum", "region", "asia", { field: "region", code: "unknownChoice" }),

	accepts("integer", "maxOpen", 3),
	rejects("integer", "maxOpen", 0, { field: "maxOpen", code: "min", params: { min: 1 } }),
	rejects("integer", "maxOpen", 6, { field: "maxOpen", code: "max", params: { max: 5 } }),
	rejects("integer", "maxOpen", 2.5, { field: "maxOpen", code: "type" }),
	rejects("integer", "maxOpen", "3", { field: "maxOpen", code: "type" }),

	accepts("number", "ratio", 0.5),
	rejects("number", "ratio", -0.1, { field: "ratio", code: "min", params: { min: 0 } }),
	rejects("number", "ratio", 1.5, { field: "ratio", code: "max", params: { max: 1 } }),
	rejects("number", "ratio", Number.NaN, { field: "ratio", code: "type" }),
	rejects("number", "ratio", "0.5", { field: "ratio", code: "type" }),

	accepts("text", "greeting", "Welcome!"),
	rejects("text", "greeting", "x".repeat(201), {
		field: "greeting",
		code: "maxLength",
		params: { max: 200 },
	}),
	rejects("text", "greeting", 42, { field: "greeting", code: "type" }),
	rejects("text", "nickname", "a", { field: "nickname", code: "minLength", params: { min: 2 } }),
	rejects("text", "nickname", [], { field: "nickname", code: "type" }),

	accepts("boolean", "enabled", false),
	rejects("boolean", "enabled", "yes", { field: "enabled", code: "type" }),

	accepts("secret", "apiKey", "sk-123"),
	rejects("secret", "apiKey", 123, { field: "apiKey", code: "type" }),

	accepts("list", "watchedChannels", [TEXT_CHANNEL]),
	accepts("list", "watchedChannels", []),
	rejects("list", "watchedChannels", [TEXT_CHANNEL, TEXT_CHANNEL], {
		field: "watchedChannels[1]",
		code: "duplicate",
	}),
	rejects("list", "watchedChannels", [TEXT_CHANNEL, VOICE_CHANNEL], {
		field: "watchedChannels[1]",
		code: "channelType",
	}),
	rejects("list", "watchedChannels", [DELETED_CHANNEL, TEXT_CHANNEL], {
		field: "watchedChannels[0]",
		code: "notFound",
	}),
	rejects("list", "watchedChannels", snowflakes(6, "20000000000000"), {
		field: "watchedChannels",
		code: "maxItems",
		params: { max: 5 },
	}),
	rejects("list", "watchedChannels", 5, { field: "watchedChannels", code: "type" }),
	rejects("list", "watchedChannels", TEXT_CHANNEL, { field: "watchedChannels", code: "type" }),
	rejects("list", "watchedChannels", ["general"], { field: "watchedChannels[0]", code: "type" }),
	accepts("list", "pingRoles", [ROLE_A, ROLE_B]),
	rejects("list", "pingRoles", [ROLE_A, DELETED_ROLE], { field: "pingRoles[1]", code: "notFound" }),
	accepts("list", "notifyUsers", [MEMBER]),
	rejects("list", "notifyUsers", [DELETED_MEMBER], { field: "notifyUsers[0]", code: "notFound" }),
	accepts("list", "tiers", ["gold"]),
	rejects("list", "tiers", ["bronze"], { field: "tiers[0]", code: "unknownChoice" }),
	accepts("list", "thresholds", [1, 2]),
	rejects("list", "thresholds", [0], { field: "thresholds[0]", code: "min", params: { min: 1 } }),
	rejects("list", "thresholds", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], {
		field: "thresholds",
		code: "maxItems",
		params: { max: 10 },
	}),
	accepts("list", "keywords", ["ticket"]),
	rejects("list", "keywords", ["x".repeat(51)], {
		field: "keywords[0]",
		code: "maxLength",
		params: { max: 50 },
	}),
	rejects("list", "keywords", null, { field: "keywords", code: "required" }),
	rejects("list", "moderators", [], { field: "moderators", code: "minItems", params: { min: 1 } }),
	rejects("list", "moderators", "", { field: "moderators", code: "type" }),

	accepts("toggles", "features", { tickets: false, logs: true }),
	accepts("toggles", "features", { logs: true }, { tickets: true, logs: true }),
	accepts("toggles", "features", {}, { tickets: true, logs: false }),
	unsets("toggles", "features"),
	rejects("toggles", "features", "tickets", { field: "features", code: "type" }),
	rejects("toggles", "features", ["tickets"], { field: "features", code: "type" }),
	rejects("toggles", "features", { tickets: "on" }, { field: "features.tickets", code: "type" }),
	rejects(
		"toggles",
		"features",
		{ music: true },
		{ field: "features.music", code: "unknownChoice" },
	),
];
