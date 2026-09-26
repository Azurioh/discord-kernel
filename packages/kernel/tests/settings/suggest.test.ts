import { afterEach, describe, expect, it, vi } from "vitest";
import { fixedClock } from "@/clock";
import { MAX_AUTOCOMPLETE_CHOICES } from "@/discord/command/autocomplete-limits";
import { ValidationError } from "@/errors/business-error";
import { TranslationRegistry } from "@/i18n/catalog";
import { createTranslator } from "@/i18n/translator";
import type { Choice } from "@/settings/choice";
import { defineSettings } from "@/settings/define-settings";
import { field } from "@/settings/fields/builders";
import type { SuggestionContext } from "@/settings/fields/field";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import type { SettingsRegistry } from "@/settings/registry";
import { createSettingsService } from "@/settings/settings-service";
import { SUGGESTION_TIMEOUT_MS } from "@/settings/timed-search";
import { createFakeLogger } from "../support/fake-logger";

const GUILD = "100000000000000001";
const USER = "400000000000000001";
const GENERAL = "500000000000000001";
const GENERAL_VOICE = "500000000000000002";
const LOGS = "500000000000000003";
const STAFF = "600000000000000001";
const STREAMERS = "600000000000000002";
const OWNER = "700000000000000001";

const CATALOG = {
	"suggest.title": { en: "Suggest", fr: "Suggestions" },
	"suggest.region": { en: "Region", fr: "Région" },
	"suggest.region.eu": { en: "Europe", fr: "Europe" },
	"suggest.region.na": { en: "North America", fr: "Amérique du Nord" },
	"suggest.region.sa": { en: "South America", fr: "Amérique du Sud" },
	"suggest.greeting": { en: "Greeting", fr: "Salutation" },
	"suggest.greeting.hello": { en: "Hello", fr: "Bonjour" },
	"suggest.greeting.welcome": { en: "Welcome", fr: "Bienvenue" },
};

/** Every search of the declaration is a spy the test replaces per case. */
function createSearches() {
	return {
		city: vi.fn(async (_query: string, _ctx: SuggestionContext): Promise<readonly Choice[]> => []),
		cityLabel: vi.fn(
			async (_value: string, _ctx: SuggestionContext) => undefined as string | undefined,
		),
		size: vi.fn(async (_query: string, _ctx: SuggestionContext): Promise<readonly Choice[]> => []),
	};
}

function createDeclaration(searches: ReturnType<typeof createSearches>) {
	return defineSettings({
		id: "suggest",
		version: 1,
		labels: { title: "suggest.title" },
		fields: {
			region: field.enum({
				label: "suggest.region",
				choices: [
					{ value: "eu", label: "suggest.region.eu" },
					{ value: "na", label: "suggest.region.na" },
					{ value: "sa", label: "suggest.region.sa" },
				],
			}),
			greeting: field.text({
				label: "suggest.greeting",
				suggest: {
					choices: [
						{ value: "hello", label: "suggest.greeting.hello" },
						{ value: "welcome", label: "suggest.greeting.welcome" },
					],
				},
			}),
			city: field.text({
				label: "suggest.city",
				suggest: { resolve: searches.city, label: searches.cityLabel, strict: true },
			}),
			size: field.integer({ label: "suggest.size", suggest: { resolve: searches.size } }),
			logChannel: field.channel({ label: "suggest.log-channel", types: ["text"] }),
			anyChannel: field.channel({ label: "suggest.any-channel" }),
			staffRole: field.role({ label: "suggest.staff-role" }),
			owner: field.user({ label: "suggest.owner" }),
			pingRoles: field.list(field.role(), { label: "suggest.ping-roles" }),
			cities: field.list(field.text({ suggest: { resolve: searches.city } }), {
				label: "suggest.cities",
			}),
			enabled: field.boolean({ label: "suggest.enabled", default: true }),
		},
	});
}

function setup() {
	const registry = new TranslationRegistry();
	registry.register(CATALOG);
	const logger = createFakeLogger();
	const translator = createTranslator(registry, {
		defaultLocale: "en",
		logger: createFakeLogger(),
	});
	const service = createSettingsService({
		registry: {} as SettingsRegistry,
		store: createInMemorySettingsStore(),
		guilds: createInMemoryGuildDirectory({
			[GUILD]: {
				channels: [
					{ id: GENERAL, name: "general", kind: "text" },
					{ id: GENERAL_VOICE, name: "general-voice", kind: "voice" },
					{ id: LOGS, name: "logs", kind: "text" },
				],
				roles: [
					{ id: STAFF, name: "Staff" },
					{ id: STREAMERS, name: "Streamers" },
				],
				members: [{ id: OWNER, name: "Owner" }],
			},
		}),
		notifier: createInProcessNotifier(logger),
		translator,
		clock: fixedClock(new Date("2026-01-01T00:00:00.000Z")),
		logger,
	});
	const searches = createSearches();
	return { service, logger, searches, declaration: createDeclaration(searches) };
}

const CTX = { guildId: GUILD, userId: USER, locale: "en", values: {} };

function names(choices: readonly Choice[]): string[] {
	return choices.map((choice) => choice.name);
}

afterEach(() => {
	vi.useRealTimers();
});

describe("SettingsService.suggest (S9)", () => {
	describe("static choices", () => {
		it("offers an enum's choices translated to the requester's locale", async () => {
			const { service, declaration } = setup();

			await expect(
				service.suggest(declaration, "region", "", { ...CTX, locale: "fr" }),
			).resolves.toStrictEqual([
				{ name: "Europe", value: "eu" },
				{ name: "Amérique du Nord", value: "na" },
				{ name: "Amérique du Sud", value: "sa" },
			]);
		});

		it("falls back to the default language for a locale the bot does not support", async () => {
			const { service, declaration } = setup();

			const choices = await service.suggest(declaration, "region", "", { ...CTX, locale: "de" });

			expect(names(choices)).toStrictEqual(["Europe", "North America", "South America"]);
		});

		it("keeps the choices whose translated name or value contains the query, whatever its case", async () => {
			const { service, declaration } = setup();

			const byName = await service.suggest(declaration, "region", "amérique", {
				...CTX,
				locale: "fr",
			});
			const byValue = await service.suggest(declaration, "region", "EU", CTX);

			expect(byName).toStrictEqual([
				{ name: "Amérique du Nord", value: "na" },
				{ name: "Amérique du Sud", value: "sa" },
			]);
			expect(byValue).toStrictEqual([{ name: "Europe", value: "eu" }]);
		});

		it("offers a text field's static suggestions the same way", async () => {
			const { service, declaration } = setup();

			await expect(
				service.suggest(declaration, "greeting", "bien", { ...CTX, locale: "fr" }),
			).resolves.toStrictEqual([{ name: "Bienvenue", value: "welcome" }]);
		});
	});

	describe("dynamic search", () => {
		it("passes the query and who asks, with the other values currently entered", async () => {
			const { service, declaration, searches } = setup();
			searches.city.mockResolvedValue([{ name: "Paris", value: "paris" }]);
			const ctx = { ...CTX, locale: "fr", values: { region: "eu", size: 3 } };

			const choices = await service.suggest(declaration, "city", "par", ctx);

			expect(choices).toStrictEqual([{ name: "Paris", value: "paris" }]);
			expect(searches.city).toHaveBeenCalledWith("par", {
				guildId: GUILD,
				userId: USER,
				locale: "fr",
				values: { region: "eu", size: 3 },
			});
		});

		it(`never returns more than ${MAX_AUTOCOMPLETE_CHOICES} results, keeping the first`, async () => {
			const { service, declaration, searches } = setup();
			const many = Array.from({ length: 30 }, (_, index) => ({ name: `n${index}`, value: index }));
			searches.size.mockResolvedValue(many);

			const choices = await service.suggest(declaration, "size", "", CTX);

			expect(choices).toStrictEqual(many.slice(0, MAX_AUTOCOMPLETE_CHOICES));
		});

		it("gives up on a search slower than 2.5 s: empty, logged, and on time", async () => {
			vi.useFakeTimers();
			const { service, declaration, searches, logger } = setup();
			searches.city.mockImplementation(
				() =>
					new Promise((resolve) => {
						setTimeout(() => resolve([{ name: "Late", value: "late" }]), 3_000);
					}),
			);
			let settled: readonly Choice[] | undefined;
			const pending = service.suggest(declaration, "city", "", CTX).then((choices) => {
				settled = choices;
				return choices;
			});

			await vi.advanceTimersByTimeAsync(SUGGESTION_TIMEOUT_MS - 1);
			expect(settled).toBeUndefined();
			await vi.advanceTimersByTimeAsync(1);

			expect(SUGGESTION_TIMEOUT_MS).toBe(2_500);
			await expect(pending).resolves.toStrictEqual([]);
			expect(logger.warn).toHaveBeenCalledWith(
				expect.objectContaining({ moduleId: "suggest", field: "city", guildId: GUILD }),
				expect.stringContaining("timed out"),
			);
		});

		it("returns nothing and logs when the search throws", async () => {
			const { service, declaration, searches, logger } = setup();
			searches.city.mockRejectedValue(new Error("backend down"));

			await expect(service.suggest(declaration, "city", "", CTX)).resolves.toStrictEqual([]);
			expect(logger.warn).toHaveBeenCalledWith(
				expect.objectContaining({ moduleId: "suggest", field: "city", err: "backend down" }),
				expect.stringContaining("failed"),
			);
		});

		it("leaves no timer behind once a search answers in time", async () => {
			vi.useFakeTimers();
			const { service, declaration, searches, logger } = setup();
			searches.city.mockResolvedValue([{ name: "Paris", value: "paris" }]);

			await service.suggest(declaration, "city", "", CTX);

			expect(vi.getTimerCount()).toBe(0);
			expect(logger.warn).not.toHaveBeenCalled();
		});

		it("suggests a list's items with the item's own search", async () => {
			const { service, declaration, searches } = setup();
			searches.city.mockResolvedValue([{ name: "Lyon", value: "lyon" }]);

			await expect(service.suggest(declaration, "cities", "ly", CTX)).resolves.toStrictEqual([
				{ name: "Lyon", value: "lyon" },
			]);
			expect(searches.city).toHaveBeenCalledWith("ly", expect.objectContaining({ guildId: GUILD }));
		});
	});

	describe("guild entities, with no search written by the module", () => {
		it("suggests the guild's channels of the field's types", async () => {
			const { service, declaration } = setup();

			await expect(service.suggest(declaration, "logChannel", "gen", CTX)).resolves.toStrictEqual([
				{ name: "general", value: GENERAL },
			]);
			await expect(service.suggest(declaration, "anyChannel", "gen", CTX)).resolves.toStrictEqual([
				{ name: "general", value: GENERAL },
				{ name: "general-voice", value: GENERAL_VOICE },
			]);
		});

		it("suggests the guild's roles and members", async () => {
			const { service, declaration } = setup();

			await expect(service.suggest(declaration, "staffRole", "st", CTX)).resolves.toStrictEqual([
				{ name: "Staff", value: STAFF },
				{ name: "Streamers", value: STREAMERS },
			]);
			await expect(service.suggest(declaration, "owner", "", CTX)).resolves.toStrictEqual([
				{ name: "Owner", value: OWNER },
			]);
		});

		it("suggests a list of roles item by item", async () => {
			const { service, declaration } = setup();

			await expect(service.suggest(declaration, "pingRoles", "str", CTX)).resolves.toStrictEqual([
				{ name: "Streamers", value: STREAMERS },
			]);
		});
	});

	it("suggests nothing for a field that declares no suggestions", async () => {
		const { service, declaration } = setup();

		await expect(service.suggest(declaration, "enabled", "", CTX)).resolves.toStrictEqual([]);
	});

	it("refuses a key the declaration does not have, as a malformed request", async () => {
		const { service, declaration } = setup();

		await expect(service.suggest(declaration, "nope", "", CTX)).rejects.toThrow(ValidationError);
	});
});

describe("SettingsService.label", () => {
	const LABEL_CTX = { guildId: GUILD, userId: USER, locale: "fr" };

	it("reads a static choice as its translated label", async () => {
		const { service, declaration } = setup();

		await expect(service.label(declaration, "region", "na", LABEL_CTX)).resolves.toBe(
			"Amérique du Nord",
		);
		await expect(service.label(declaration, "greeting", "hello", LABEL_CTX)).resolves.toBe(
			"Bonjour",
		);
		await expect(service.label(declaration, "region", "xx", LABEL_CTX)).resolves.toBeUndefined();
	});

	it("asks the search's own label, with who asks and the guild's current values", async () => {
		const { service, declaration, searches } = setup();
		searches.cityLabel.mockResolvedValue("Paris, France");

		await expect(service.label(declaration, "city", "paris", LABEL_CTX)).resolves.toBe(
			"Paris, France",
		);
		expect(searches.cityLabel).toHaveBeenCalledWith("paris", {
			...LABEL_CTX,
			values: expect.objectContaining({ enabled: true }),
		});
	});

	it("finds the exact value in the search results when the search declares no label", async () => {
		const { service, declaration, searches } = setup();
		searches.size.mockResolvedValue([
			{ name: "Twelve", value: 12 },
			{ name: "Two", value: 2 },
		]);

		await expect(service.label(declaration, "size", 2, LABEL_CTX)).resolves.toBe("Two");
		expect(searches.size).toHaveBeenCalledWith("2", expect.objectContaining({ guildId: GUILD }));
		await expect(service.label(declaration, "size", 3, LABEL_CTX)).resolves.toBeUndefined();
	});

	it("reads a channel, a role and a member as their name on the guild", async () => {
		const { service, declaration } = setup();

		await expect(service.label(declaration, "logChannel", LOGS, LABEL_CTX)).resolves.toBe("logs");
		await expect(service.label(declaration, "staffRole", STAFF, LABEL_CTX)).resolves.toBe("Staff");
		await expect(service.label(declaration, "owner", OWNER, LABEL_CTX)).resolves.toBe("Owner");
		await expect(service.label(declaration, "pingRoles", STAFF, LABEL_CTX)).resolves.toBe("Staff");
		await expect(
			service.label(declaration, "staffRole", "600000000000000099", LABEL_CTX),
		).resolves.toBeUndefined();
	});

	it("reads nothing when the label search times out, and logs it", async () => {
		vi.useFakeTimers();
		const { service, declaration, searches, logger } = setup();
		searches.cityLabel.mockImplementation(
			() =>
				new Promise((resolve) => {
					setTimeout(() => resolve("Too late"), 3_000);
				}),
		);

		const pending = service.label(declaration, "city", "paris", LABEL_CTX);
		await vi.advanceTimersByTimeAsync(SUGGESTION_TIMEOUT_MS);

		await expect(pending).resolves.toBeUndefined();
		expect(logger.warn).toHaveBeenCalledTimes(1);
	});

	it("reads nothing for a field that has no labels", async () => {
		const { service, declaration } = setup();

		await expect(service.label(declaration, "enabled", true, LABEL_CTX)).resolves.toBeUndefined();
	});

	it("refuses a key the declaration does not have, as a malformed request", async () => {
		const { service, declaration } = setup();

		await expect(service.label(declaration, "nope", "x", LABEL_CTX)).rejects.toThrow(
			ValidationError,
		);
	});
});
