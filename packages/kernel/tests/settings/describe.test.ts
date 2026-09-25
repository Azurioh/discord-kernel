import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it, vi } from "vitest";
import { fixedClock } from "@/clock";
import { type Catalog, TranslationRegistry } from "@/i18n/catalog";
import { createTranslator, type Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";
import { defineSettings } from "@/settings/define-settings";
import { describeSettings, type SettingsSchema } from "@/settings/describe";
import { field } from "@/settings/fields/builders";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import type { SettingsRegistry } from "@/settings/registry";
import { createSettingsService } from "@/settings/settings-service";
import { createFakeLogger } from "../support/fake-logger";
import {
	SAMPLE_FIELD_ACCESS,
	SAMPLE_GROUP_ACCESS,
	SAMPLE_KEYS,
	SAMPLE_MODULE_ACCESS,
	sampleSettings,
} from "./fixtures/sample-declaration";

const SAMPLE_KEY_SET: ReadonlySet<string> = new Set(SAMPLE_KEYS);

/**
 * Keys whose translation must appear in the description: every text of the
 * sample except the placeholder, which the description contract does not carry.
 */
const DESCRIBED_KEYS = SAMPLE_KEYS.filter((key) => key !== "sample.settings.greeting.placeholder");

/** One JSON object of the description: a schema, a subschema or an `x-kernel` value. */
type SchemaNode = { readonly [keyword: string]: unknown };

function en(key: string): string {
	return `EN ${key}`;
}

function fr(key: string): string {
	return `FR ${key}`;
}

/** A catalog of the sample keys, in English and French except `untranslated`, English only. */
function sampleCatalog(untranslated?: string): Catalog {
	return Object.fromEntries(
		SAMPLE_KEYS.map((key) => [
			key,
			key === untranslated ? { en: en(key) } : { en: en(key), fr: fr(key) },
		]),
	);
}

function makeTranslator(catalog: Catalog): Translator {
	const registry = new TranslationRegistry();
	registry.register(catalog);
	return createTranslator(registry, { defaultLocale: "en", logger: createFakeLogger() });
}

function describeSample(locale: string, untranslated?: string): SettingsSchema {
	return describeSettings({
		declaration: sampleSettings,
		locale,
		translator: makeTranslator(sampleCatalog(untranslated)),
	});
}

function node(value: unknown): SchemaNode {
	expect(value).toBeTypeOf("object");
	expect(value).not.toBeNull();
	return value as SchemaNode;
}

function property(schema: SettingsSchema, key: string): SchemaNode {
	return node(node(schema.properties)[key]);
}

function kernel(value: SchemaNode | SettingsSchema): SchemaNode {
	return node(value["x-kernel"]);
}

/** Every string value of a JSON document, at any depth (object keys excluded). */
function stringsOf(value: unknown): string[] {
	if (typeof value === "string") {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.flatMap(stringsOf);
	}
	if (typeof value === "object" && value !== null) {
		return Object.values(value).flatMap(stringsOf);
	}
	return [];
}

/** Every object key of a JSON document, at any depth. */
function keysOf(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.flatMap(keysOf);
	}
	if (typeof value === "object" && value !== null) {
		return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
	}
	return [];
}

/** A validator that knows the kernel keyword, so strict mode accepts it. */
function makeAjv(): Ajv2020 {
	return new Ajv2020({ allErrors: true, keywords: ["x-kernel"], strictTypes: false });
}

describe("describeSettings: JSON Schema validity", () => {
	it.each(["fr", "en", "xx"])("is a valid draft 2020-12 document in locale %s", (locale) => {
		const ajv = makeAjv();

		const valid = ajv.validateSchema(describeSample(locale));

		expect(ajv.errors ?? []).toStrictEqual([]);
		expect(valid).toBe(true);
	});

	it("compiles into a validator that accepts stored values and rejects undeclared keys", () => {
		const validate = makeAjv().compile(describeSample("fr"));
		const stored = {
			logChannel: "100000000000000002",
			keywords: ["ticket"],
			maxOpen: 3,
			region: "na",
			apiKey: "s3cr3t",
			features: { tickets: true, logs: false },
		};

		expect(validate(stored)).toBe(true);
		expect(validate({ ...stored, unknown: 1 })).toBe(false);
		expect(validate({ ...stored, features: { tickets: true, archive: true } })).toBe(false);
		expect(validate({ ...stored, features: { tickets: "yes" } })).toBe(false);
		expect(validate({ ...stored, maxOpen: 9 })).toBe(false);
		expect(validate({ ...stored, region: "asia" })).toBe(false);
		expect(validate({ keywords: ["ticket"] })).toBe(false);
	});
});

describe("describeSettings: localisation", () => {
	it("translates every text into French, leaving no English and no raw key", () => {
		const strings = stringsOf(describeSample("fr"));

		expect(strings.filter((text) => text.startsWith("EN "))).toStrictEqual([]);
		expect(strings.filter((text) => SAMPLE_KEY_SET.has(text))).toStrictEqual([]);
		for (const key of DESCRIBED_KEYS) {
			expect(strings).toContain(fr(key));
		}
		expect(kernel(describeSample("fr")).locale).toBe("fr");
	});

	it("resolves a regional variant to its base language", () => {
		expect(kernel(describeSample("fr-FR")).locale).toBe("fr");
	});

	it("falls back entirely to English for an unsupported locale and reports en", () => {
		const schema = describeSample("xx");
		const strings = stringsOf(schema);

		expect(strings.filter((text) => text.startsWith("FR "))).toStrictEqual([]);
		for (const key of DESCRIBED_KEYS) {
			expect(strings).toContain(en(key));
		}
		expect(kernel(schema).locale).toBe("en");
	});

	it("falls back to English for one missing French key and keeps the others in French", () => {
		const schema = describeSample("fr", "sample.settings.max-open");

		expect(property(schema, "maxOpen").title).toBe(en("sample.settings.max-open"));
		expect(property(schema, "maxOpen").description).toBe(
			fr("sample.settings.max-open.description"),
		);
		expect(property(schema, "region").title).toBe(fr("sample.settings.region"));
		expect(schema.title).toBe(fr("sample.settings.title"));
		expect(kernel(schema).locale).toBe("fr");
	});
});

describe("describeSettings: module level", () => {
	it("describes the module as a closed object with its required fields", () => {
		const schema = describeSample("fr");

		expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
		expect(schema.$id).toBe("urn:discord-kernel:settings:sample:v1");
		expect(schema.title).toBe(fr("sample.settings.title"));
		expect(schema.description).toBe(fr("sample.settings.description"));
		expect(schema.type).toBe("object");
		expect(schema.additionalProperties).toBe(false);
		expect([...(schema.required as readonly string[])].sort()).toStrictEqual([
			"keywords",
			"logChannel",
		]);
		expect(Object.keys(node(schema.properties))).toStrictEqual(Object.keys(sampleSettings.fields));
	});

	it("carries the module id, version, icon, locale and ordered, translated groups", () => {
		expect(kernel(describeSample("fr"))).toStrictEqual({
			module: "sample",
			version: 1,
			icon: "gear",
			locale: "fr",
			groups: [
				{
					id: "general",
					title: fr("sample.settings.group.general"),
					description: fr("sample.settings.group.general.description"),
					order: 1,
				},
				{ id: "limits", title: fr("sample.settings.group.limits"), order: 2 },
			],
		});
	});

	it("orders groups by their declared order when the module sets no group order", () => {
		const declaration = defineSettings({
			id: "unordered",
			version: 1,
			labels: { title: "unordered.title" },
			groups: {
				late: { label: "unordered.late", order: 2 },
				early: { label: "unordered.early", order: 1 },
			},
			fields: { flag: field.boolean({ label: "unordered.flag", ui: { group: "late" } }) },
		});
		const translator = makeTranslator({
			"unordered.title": { en: "Unordered" },
			"unordered.late": { en: "Late" },
			"unordered.early": { en: "Early" },
			"unordered.flag": { en: "Flag" },
		});

		const groups = kernel(describeSettings({ declaration, locale: "en", translator })).groups;

		expect(groups).toStrictEqual([
			{ id: "early", title: "Early", order: 1 },
			{ id: "late", title: "Late", order: 2 },
		]);
	});

	it("never exposes an access declaration, at any level", () => {
		const schema = describeSample("fr");
		const strings = stringsOf(schema);

		expect(keysOf(schema)).not.toContain("access");
		for (const access of [SAMPLE_MODULE_ACCESS, SAMPLE_GROUP_ACCESS, SAMPLE_FIELD_ACCESS]) {
			expect(strings).not.toContain(access.permission);
		}
	});
});

describe("describeSettings: fields", () => {
	it("gives every property its field kind under x-kernel", () => {
		const schema = describeSample("fr");

		for (const [key, declared] of Object.entries(sampleSettings.fields)) {
			expect(kernel(property(schema, key)).kind, key).toBe(declared.spec.kind);
		}
	});

	it("describes a secret as write-only, with no default, example or value", () => {
		const secret = property(describeSample("fr"), "apiKey");

		expect(secret.type).toBe("string");
		expect(secret.writeOnly).toBe(true);
		expect(secret.title).toBe(fr("sample.settings.api-key"));
		expect(secret.description).toBe(fr("sample.settings.api-key.description"));
		for (const keyword of ["default", "examples", "const", "enum"]) {
			expect(secret, keyword).not.toHaveProperty(keyword);
		}
		expect(kernel(secret)).toStrictEqual({ kind: "secret", group: "limits", advanced: true });
	});

	it("describes toggles as a closed object of translated booleans with per-key defaults", () => {
		const toggles = property(describeSample("fr"), "features");
		const properties = node(toggles.properties);

		expect(toggles.type).toBe("object");
		expect(toggles.additionalProperties).toBe(false);
		expect(toggles.title).toBe(fr("sample.settings.features"));
		expect(Object.keys(properties)).toStrictEqual(["tickets", "logs"]);
		expect(properties.tickets).toMatchObject({
			type: "boolean",
			title: fr("sample.settings.feature.tickets"),
			default: true,
		});
		expect(properties.logs).toMatchObject({
			type: "boolean",
			title: fr("sample.settings.feature.logs"),
			default: false,
		});
		expect(kernel(toggles).kind).toBe("toggles");
	});

	it("puts every declared hint under x-kernel, translated, or under its standard keyword", () => {
		const schema = describeSample("fr");
		const maxOpen = property(schema, "maxOpen");

		expect(maxOpen).toMatchObject({
			type: "integer",
			minimum: 1,
			maximum: 5,
			default: 1,
			examples: [1, 3],
			title: fr("sample.settings.max-open"),
			description: fr("sample.settings.max-open.description"),
		});
		expect(kernel(maxOpen)).toStrictEqual({
			kind: "integer",
			group: "limits",
			order: 1,
			unit: fr("sample.settings.unit.tickets"),
			hint: "slider",
			advanced: true,
		});
		expect(property(schema, "greeting").examples).toStrictEqual(["Welcome!"]);
		expect(kernel(property(schema, "cooldown")).unit).toBe(fr("sample.settings.unit.seconds"));
		expect(kernel(property(schema, "staffRole"))).toMatchObject({ group: "general", order: 2 });
	});

	it("describes choices, bounds and built-in suggestions with standard keywords", () => {
		const schema = describeSample("fr");

		expect(property(schema, "region")).toMatchObject({
			type: "string",
			oneOf: [
				{ const: "eu", title: fr("sample.settings.region.eu") },
				{ const: "na", title: fr("sample.settings.region.na") },
			],
			default: "eu",
		});
		expect(kernel(property(schema, "region"))).toMatchObject({ kind: "enum", suggest: "static" });
		expect(property(schema, "cooldown")).toMatchObject({
			type: "integer",
			minimum: 60,
			maximum: 86_400,
			default: 900,
		});
		expect(property(schema, "greeting")).toMatchObject({ type: "string", maxLength: 200 });
		expect(property(schema, "watchedChannels")).toMatchObject({
			type: "array",
			maxItems: 5,
			default: [],
		});
		expect(kernel(property(schema, "logChannel"))).toMatchObject({
			kind: "channel",
			channelTypes: ["text", "announcement"],
			group: "general",
			order: 1,
			suggest: "guild",
		});
		expect(kernel(property(schema, "staffRole")).suggest).toBe("guild");
		expect(kernel(property(schema, "owner")).suggest).toBe("guild");
		expect(kernel(property(schema, "maxOpen"))).not.toHaveProperty("suggest");
	});
});

describe("describeSettings: contract shape", () => {
	const ticketSettings = defineSettings({
		id: "ticket",
		version: 2,
		migrate: (_fromVersion, raw) => raw,
		labels: { title: "ticket.title", description: "ticket.description" },
		ui: { icon: "ticket", groupOrder: ["general", "limits"] },
		groups: {
			general: { label: "ticket.group.general", order: 1 },
			limits: { label: "ticket.group.limits", order: 2 },
		},
		fields: {
			category: field.channel({
				label: "ticket.category",
				types: ["category"],
				required: true,
				ui: { group: "general", order: 1 },
			}),
			maxOpen: field.integer({
				label: "ticket.max-open",
				min: 1,
				max: 5,
				default: 1,
				unit: "ticket.unit",
				ui: { group: "limits", order: 2, hint: "slider", advanced: true, examples: [1, 3] },
			}),
			game: field.text({
				label: "ticket.game",
				suggest: { resolve: async () => [], strict: true },
			}),
			region: field.enum({
				label: "ticket.region",
				choices: [
					{ value: "eu", label: "ticket.region.eu" },
					{ value: "na", label: "ticket.region.na" },
				],
				default: "eu",
			}),
			webhookKey: field.secret({ label: "ticket.webhook-key" }),
		},
	});
	const ticketCatalog: Catalog = {
		"ticket.title": { en: "Tickets", fr: "Tickets" },
		"ticket.description": {
			en: "Ticket system configuration",
			fr: "Configuration du système de tickets",
		},
		"ticket.group.general": { en: "General", fr: "Général" },
		"ticket.group.limits": { en: "Limits", fr: "Limites" },
		"ticket.category": { en: "Ticket category", fr: "Catégorie des tickets" },
		"ticket.max-open": { en: "Max open tickets", fr: "Tickets ouverts max" },
		"ticket.unit": { en: "tickets", fr: "tickets" },
		"ticket.game": { en: "Game", fr: "Jeu" },
		"ticket.region": { en: "Region", fr: "Région" },
		"ticket.region.eu": { en: "Europe", fr: "Europe" },
		"ticket.region.na": { en: "North America", fr: "Amérique du Nord" },
		"ticket.webhook-key": { en: "Webhook key", fr: "Clé du webhook" },
	};

	function describeTicket(): SettingsSchema {
		return describeSettings({
			declaration: ticketSettings,
			locale: "fr",
			translator: makeTranslator(ticketCatalog),
		});
	}

	it("matches the documented example", () => {
		expect(describeTicket()).toMatchObject({
			$schema: "https://json-schema.org/draft/2020-12/schema",
			$id: "urn:discord-kernel:settings:ticket:v2",
			title: "Tickets",
			description: "Configuration du système de tickets",
			type: "object",
			additionalProperties: false,
			required: ["category"],
			properties: {
				category: {
					type: "string",
					pattern: expect.any(String),
					title: "Catégorie des tickets",
				},
				maxOpen: {
					type: "integer",
					minimum: 1,
					maximum: 5,
					default: 1,
					examples: [1, 3],
					title: "Tickets ouverts max",
				},
				game: { type: "string", title: "Jeu" },
				region: {
					type: "string",
					oneOf: [
						{ const: "eu", title: "Europe" },
						{ const: "na", title: "Amérique du Nord" },
					],
					default: "eu",
					title: "Région",
				},
				webhookKey: { type: "string", writeOnly: true, title: "Clé du webhook" },
			},
			"x-kernel": {
				module: "ticket",
				version: 2,
				icon: "ticket",
				locale: "fr",
				groups: [
					{ id: "general", title: "Général", order: 1 },
					{ id: "limits", title: "Limites", order: 2 },
				],
			},
		});
	});

	it("carries exactly the documented kernel hints on each property", () => {
		const schema = describeTicket();

		expect(kernel(property(schema, "category"))).toStrictEqual({
			kind: "channel",
			channelTypes: ["category"],
			group: "general",
			order: 1,
			suggest: "guild",
		});
		expect(kernel(property(schema, "maxOpen"))).toStrictEqual({
			kind: "integer",
			group: "limits",
			order: 2,
			unit: "tickets",
			hint: "slider",
			advanced: true,
		});
		expect(kernel(property(schema, "game"))).toStrictEqual({
			kind: "text",
			suggest: "dynamic",
			strict: true,
		});
		expect(kernel(property(schema, "region"))).toStrictEqual({ kind: "enum", suggest: "static" });
		expect(kernel(property(schema, "webhookKey"))).toStrictEqual({ kind: "secret" });
	});

	it("restricts a channel to a snowflake pattern", () => {
		const pattern = new RegExp(String(property(describeTicket(), "category").pattern), "u");

		expect(pattern.test("100000000000000002")).toBe(true);
		expect(pattern.test("general")).toBe(false);
	});
});

describe("SettingsService.describe", () => {
	it("returns the translated description of the declaration", () => {
		const logger = createFakeLogger();
		const translator = makeTranslator(sampleCatalog());
		const service = createSettingsService({
			// Describing never consults the registry: the declaration is passed in.
			registry: {} as SettingsRegistry,
			store: createInMemorySettingsStore(),
			guilds: createInMemoryGuildDirectory({}),
			notifier: createInProcessNotifier(logger),
			translator,
			clock: fixedClock(new Date("2026-01-01T00:00:00.000Z")),
			logger,
		});
		const schema = service.describe(sampleSettings, "fr");

		expect(schema).toStrictEqual(
			describeSettings({ declaration: sampleSettings, locale: "fr", translator }),
		);
	});
});
