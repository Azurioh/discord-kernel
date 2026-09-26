import { ChannelType, type ModalMessageModalSubmitInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { fixedClock } from "@/clock";
import { settingsEditorFromDeclaration } from "@/discord/components/settings-editor/from-declaration";
import { OTHER_VALUE_SUFFIX } from "@/discord/components/settings-editor/from-declaration-controls";
import { MAX_SELECT_OPTIONS } from "@/discord/components/settings-editor/settings-editor.view";
import { MAX_CARD_LEVEL_ENTRIES } from "@/discord/components/settings-editor/settings-editor-card.view";
import type { SettingsEditorGroupSubmission } from "@/discord/components/settings-editor/settings-editor-field-modal";
import {
	isPickerField,
	MAX_MODAL_COMPONENTS,
	type SettingsEditorChoiceField,
	type SettingsEditorField,
	type SettingsEditorGroupField,
	type SettingsEditorPickerField,
	type SettingsEditorValueField,
} from "@/discord/components/settings-editor/settings-editor-fields";
import { SETTINGS_EDITOR_MESSAGES } from "@/discord/i18n";
import type { Locale } from "@/i18n/locale";
import type { Translator } from "@/i18n/translator";
import type { Choice } from "@/settings/choice";
import { defineSettings, type SettingsDeclaration } from "@/settings/define-settings";
import { field } from "@/settings/fields/builders";
import type { AnyField, SuggestionContext } from "@/settings/fields/field";
import { createInMemoryGuildDirectory } from "@/settings/in-memory/in-memory-guild-directory";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import { SETTINGS_MESSAGES } from "@/settings/messages";
import type { GuildDirectory } from "@/settings/ports/guild-directory";
import type { SettingsStore } from "@/settings/ports/settings-store";
import type { SettingsRegistry } from "@/settings/registry";
import { createSettingsService } from "@/settings/settings-service";
import { SettingsValidationError } from "@/settings/settings-validation-error";
import {
	TEXT_CHANNEL,
	VALUE_CASES,
	VALUE_CASES_DIRECTORY_SEED,
	VALUE_CASES_GUILD,
	type ValueCase,
	valueCasesSettings,
} from "../../../settings/fixtures/value-cases";
import { createFakeLogger } from "../../../support/fake-logger";

const GUILD = "100000000000000001";
const ADMIN = "200000000000000001";
const LOCALE: Locale = "en";

/** Guild entities as snowflakes: the shared validator refuses any other id. */
const TEXT_CHANNEL_ID = "500000000000000001";
const LOGS_CHANNEL = "500000000000000002";
const CATEGORY_CHANNEL = "500000000000000003";
const DELETED_CHANNEL_ID = "500000000000000099";
const STAFF_ROLE = "600000000000000001";
const MOD_ROLE = "600000000000000002";
const DELETED_ROLE_ID = "600000000000000099";
const OWNER = "700000000000000001";
const LEFT_MEMBER = "700000000000000099";

/** Echoes the key, so an assertion names the string the adapter asked for. */
const translator = {
	defaultLocale: LOCALE,
	translate: (_locale: Locale, key: string) => key,
	resolve: (_locale: Locale, text: string | { key: string }) =>
		typeof text === "string" ? text : text.key,
} as Translator;

const CONTEXT = { guildId: GUILD, userId: ADMIN, locale: LOCALE, translator };

/** The modal's submit interaction: the adapter only hands it back to the editor. */
const INTERACTION = {} as ModalMessageModalSubmitInteraction;

const directory = createInMemoryGuildDirectory({
	[GUILD]: {
		channels: [
			{ id: TEXT_CHANNEL_ID, name: "general", kind: "text" },
			{ id: LOGS_CHANNEL, name: "logs", kind: "text" },
			{ id: CATEGORY_CHANNEL, name: "Tickets", kind: "category" },
		],
		roles: [
			{ id: STAFF_ROLE, name: "Staff" },
			{ id: MOD_ROLE, name: "Moderators" },
		],
		members: [{ id: OWNER, name: "Owner" }],
	},
});

type Adapter = Awaited<ReturnType<typeof settingsEditorFromDeclaration>>;
type EditorField = SettingsEditorField<string>;
type MemberField = SettingsEditorValueField<string> | SettingsEditorPickerField<string>;

interface Editable {
	readonly field: MemberField;
	/** The group entry the field is a member of, or `null` when it is an entry itself. */
	readonly group: SettingsEditorGroupField<string> | null;
}

/** A module whose fields are mapped one by one: one field per row of research R10. */
const mappingSettings = defineSettings({
	id: "mapping",
	version: 1,
	labels: { title: "mapping.title" },
	fields: {
		title: field.text({
			label: "mapping.title.label",
			description: "mapping.title.hint",
			maxLength: 200,
		}),
		count: field.integer({ label: "mapping.count", min: 1, max: 10, default: 3 }),
		ratio: field.number({ label: "mapping.ratio", min: 0, max: 1 }),
		cooldown: field.duration({ label: "mapping.cooldown", default: 900 }),
		accent: field.color({ label: "mapping.accent", default: "#5865f2" }),
		apiKey: field.secret({ label: "mapping.api-key" }),
		enabled: field.boolean({ label: "mapping.enabled", default: false }),
		region: field.enum({
			label: "mapping.region",
			choices: [
				{ value: "eu", label: "mapping.region.eu" },
				{ value: "na", label: "mapping.region.na" },
			],
			default: "eu",
		}),
		staffRole: field.role({ label: "mapping.staff-role" }),
		owner: field.user({ label: "mapping.owner" }),
		logChannel: field.channel({ label: "mapping.log-channel", types: ["text"] }),
		ticketCategory: field.channel({ label: "mapping.ticket-category", types: ["category"] }),
		helpers: field.list(field.role(), { label: "mapping.helpers", minItems: 1, maxItems: 3 }),
	},
});

/** 8 fields in 2 groups, declared in an order the screen must keep. */
const groupedSettings = defineSettings({
	id: "grouped",
	version: 1,
	labels: { title: "grouped.title" },
	groups: {
		general: { label: "grouped.group.general", description: "grouped.group.general.hint" },
		limits: { label: "grouped.group.limits", description: "grouped.group.limits.hint" },
	},
	fields: {
		title: field.text({ label: "grouped.title.label", ui: { group: "general" } }),
		logChannel: field.channel({ label: "grouped.log-channel", ui: { group: "general" } }),
		staffRole: field.role({ label: "grouped.staff-role", ui: { group: "general" } }),
		enabled: field.boolean({ label: "grouped.enabled", default: true, ui: { group: "general" } }),
		count: field.integer({ label: "grouped.count", default: 2, ui: { group: "limits" } }),
		cooldown: field.duration({ label: "grouped.cooldown", default: 60, ui: { group: "limits" } }),
		region: field.enum({
			label: "grouped.region",
			choices: [
				{ value: "eu", label: "grouped.region.eu" },
				{ value: "na", label: "grouped.region.na" },
			],
			default: "eu",
			ui: { group: "limits" },
		}),
		apiKey: field.secret({ label: "grouped.api-key", ui: { group: "limits" } }),
	},
});

/** A field of its own then two groups, with the order hints given. */
function orderedSettings(hints: {
	groupOrder?: readonly string[];
	firstOrder?: number;
	secondOrder?: number;
	a2Order?: number;
}): SettingsDeclaration {
	const { groupOrder, firstOrder, secondOrder, a2Order } = hints;
	return defineSettings({
		id: "ordered",
		version: 1,
		labels: { title: "ordered.title" },
		...(groupOrder === undefined ? {} : { ui: { groupOrder } }),
		groups: {
			first: { label: "ordered.first", ...(firstOrder === undefined ? {} : { order: firstOrder }) },
			second: {
				label: "ordered.second",
				...(secondOrder === undefined ? {} : { order: secondOrder }),
			},
		},
		fields: {
			intro: field.text({ label: "ordered.intro" }),
			a1: field.text({ label: "ordered.a1", ui: { group: "first" } }),
			a2: field.text({
				label: "ordered.a2",
				ui: { group: "first", ...(a2Order === undefined ? {} : { order: a2Order }) },
			}),
			b1: field.text({ label: "ordered.b1", ui: { group: "second" } }),
		},
	});
}

/** Keys `prefix01` to `prefix<count>`, zero-padded so they sort as declared. */
function numberedKeys(prefix: string, count: number): string[] {
	return Array.from(
		{ length: count },
		(_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`,
	);
}

/** Text fields `f01`… spread over groups of the given sizes, in declaration order. */
function manyFieldsSettings(id: string, groupSizes: readonly number[]): SettingsDeclaration {
	const groups: Record<string, { label: string }> = {};
	const fields: Record<string, AnyField> = {};
	let next = 1;
	groupSizes.forEach((size, groupIndex) => {
		const group = `g${groupIndex + 1}`;
		groups[group] = { label: `${id}.group.${group}` };
		for (let count = 0; count < size; count += 1) {
			const key = `f${String(next).padStart(2, "0")}`;
			fields[key] = field.text({ label: `${id}.${key}`, ui: { group } });
			next += 1;
		}
	});
	return defineSettings({ id, version: 1, labels: { title: `${id}.title` }, groups, fields });
}

const TOGGLE_KEYS = ["alpha", "beta", "gamma"] as const;

const togglesSettings = defineSettings({
	id: "toggled",
	version: 1,
	labels: { title: "toggled.title" },
	fields: {
		features: field.toggles({
			label: "toggled.features",
			keys: TOGGLE_KEYS,
			keyLabels: { alpha: "toggled.alpha", beta: "toggled.beta", gamma: "toggled.gamma" },
			default: { beta: true },
		}),
	},
});

const MANY_TOGGLE_KEYS = numberedKeys("k", 30);

const manyTogglesSettings = defineSettings({
	id: "many-toggles",
	version: 1,
	labels: { title: "many-toggles.title" },
	fields: {
		modules: field.toggles({
			label: "many-toggles.modules",
			keys: MANY_TOGGLE_KEYS,
			keyLabels: Object.fromEntries(MANY_TOGGLE_KEYS.map((key) => [key, `many-toggles.${key}`])),
		}),
	},
});

/** An in-memory store holding `stored` as the guild's settings of `declaration`, if given. */
async function createStore(declaration: SettingsDeclaration, stored?: Record<string, unknown>) {
	const store = createInMemorySettingsStore();
	if (stored !== undefined) {
		await store.write(
			{
				guildId: GUILD,
				moduleId: declaration.id,
				version: declaration.version,
				revision: 1,
				values: stored,
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
			{ expectedRevision: null },
		);
	}
	return store;
}

function createService(params: { store: SettingsStore; guilds: GuildDirectory }) {
	const logger = createFakeLogger();
	return createSettingsService({
		registry: {} as SettingsRegistry,
		store: params.store,
		guilds: params.guilds,
		notifier: createInProcessNotifier(logger),
		translator,
		clock: fixedClock(new Date("2026-02-01T00:00:00.000Z")),
		logger,
	});
}

async function setup(declaration: SettingsDeclaration, stored?: Record<string, unknown>) {
	const store = await createStore(declaration, stored);
	const service = createService({ store, guilds: directory });
	const set = vi.spyOn(service, "set");
	const adapter = await settingsEditorFromDeclaration(declaration, service, CONTEXT);
	return { store, service, set, adapter, subject: adapter.initial.subject };
}

/** Every level of the screen, root included, by key. */
function levelFields(adapter: Adapter): Map<string, readonly EditorField[]> {
	const levels = new Map<string, readonly EditorField[]>([["root", adapter.fields]]);
	for (const level of adapter.levels ?? []) {
		levels.set(level.key, level.fields);
	}
	return levels;
}

/**
 * Every editable field in the order an administrator meets it: entries of a
 * level top to bottom, a group's members in order, a nested level where its
 * entry stands.
 */
function editables(adapter: Adapter): Editable[] {
	const levels = levelFields(adapter);
	const walk = (fields: readonly EditorField[]): Editable[] =>
		fields.flatMap((entry): Editable[] => {
			if (entry.kind === "level") {
				return walk(levels.get(entry.levelKey) ?? []);
			}
			if (entry.kind === "group") {
				return entry.fields.map((member) => ({ field: member, group: entry }));
			}
			return [{ field: entry, group: null }];
		});
	return walk(adapter.fields);
}

function editable(adapter: Adapter, key: string): Editable {
	const found = editables(adapter).find((entry) => entry.field.key === key);
	if (found === undefined) {
		throw new Error(`No editable field "${key}" on the screen`);
	}
	return found;
}

function choiceControls(adapter: Adapter): SettingsEditorChoiceField<string>[] {
	return editables(adapter).flatMap(({ field: entry }) => (entry.kind === "choice" ? [entry] : []));
}

interface Answer {
	readonly value?: string | null;
	readonly ids?: readonly string[] | null;
}

/**
 * Submit `answer` for one field the way the editor would: through `save` for
 * an entry of its own, through `saveGroup` with every other member prefilled
 * from `currentValue` for a group member.
 */
async function submit(adapter: Adapter, subject: unknown, key: string, answer: Answer) {
	const { group } = editable(adapter, key);
	if (group === null) {
		return adapter.save(subject, key, {
			interaction: INTERACTION,
			value: answer.value ?? null,
			upload: null,
			ids: answer.ids ?? null,
		});
	}
	if (adapter.saveGroup === undefined) {
		throw new Error("A screen with groups must provide saveGroup");
	}
	const submissions: SettingsEditorGroupSubmission<string> = Object.fromEntries(
		group.fields.map((member) => {
			if (member.key === key) {
				return [member.key, { value: answer.value ?? null, upload: null, ids: answer.ids ?? null }];
			}
			const current = adapter.currentValue(subject, member.key);
			if (isPickerField(member)) {
				const ids = current.picked.length > 0 ? current.picked : null;
				return [member.key, { value: null, upload: null, ids }];
			}
			return [member.key, { value: current.text, upload: null, ids: null }];
		}),
	);
	return adapter.saveGroup(subject, group.key, submissions, INTERACTION);
}

/**
 * A valid value of every required field of {@link valueCasesSettings} the
 * screen groups with another field, stored on both paths before a case runs:
 * a group is saved whole, so an unset required member would add its own issue
 * to every case of its group.
 */
const VALUE_CASES_BASELINE = { logChannel: TEXT_CHANNEL };

/** List item kinds the editor offers as a picker or a choice (research R10). */
const PICKED_ITEM_KINDS = new Set(["channel", "role", "user", "enum"]);

/** Result of one write: accepted, or rejected with its sorted issue codes. */
type WriteOutcome =
	| { readonly ok: true }
	| { readonly ok: false; readonly codes: readonly string[] };

async function writeOutcome(write: Promise<unknown>): Promise<WriteOutcome> {
	try {
		await write;
		return { ok: true };
	} catch (error) {
		if (error instanceof SettingsValidationError) {
			return { ok: false, codes: error.issues.map((issue) => issue.code).sort() };
		}
		throw error;
	}
}

function expectedOutcome({ expected }: ValueCase): WriteOutcome {
	if (expected.ok) {
		return { ok: true };
	}
	return { ok: false, codes: expected.issues.map((issue) => issue.code).sort() };
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function isBooleanRecord(value: unknown): value is Readonly<Record<string, boolean>> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.values(value).every((entry) => typeof entry === "boolean")
	);
}

/**
 * The keys a toggles select shows picked once `value` is applied: the select
 * opens on the field's current state (its defaults on a fresh guild), and
 * the administrator turns keys on and off from there.
 */
function toggledKeys(declared: AnyField, value: Readonly<Record<string, boolean>>): string[] {
	const state = { ...(declared.default as Readonly<Record<string, boolean>>), ...value };
	return Object.keys(state).filter((key) => state[key]);
}

/**
 * The answer an administrator gives on the Discord screen to submit a case's
 * value, or `null` when no answer denotes that value. The screen only
 * produces text (typed entries) and id lists (pickers and choices), so:
 * - a string-valued kind (text, secret, color) takes a string as typed;
 * - a numeric kind (integer, number) takes a number as its decimal text;
 * - a duration takes a string as typed and a number of seconds as `<n>s`;
 * - a single picker or choice (channel, role, user, enum, boolean) takes a
 *   string as the one picked id, a boolean as its `"true"`/`"false"` choice;
 * - a list of picked items takes an array of strings as the picked ids;
 * - a list of typed items (integer, text) takes an array as one item per line;
 * - toggles take a boolean record as the keys left on (see {@link toggledKeys});
 * - `null` is the entry or selection cleared.
 * A value of another JS type than its surface produces has none.
 */
function discordAnswer({ kind, key, value }: ValueCase): Answer | null {
	const declared: AnyField = valueCasesSettings.fields[key];
	const { spec } = declared;
	if (spec.kind === "list" && !PICKED_ITEM_KINDS.has(spec.item.spec.kind)) {
		return typedListAnswer(value);
	}
	if (value === null) {
		return { value: null, ids: null };
	}
	switch (kind) {
		case "text":
		case "secret":
		case "color":
			return isString(value) ? { value } : null;
		case "integer":
		case "number":
			return typeof value === "number" ? { value: String(value) } : null;
		case "duration":
			return isString(value) ? { value } : { value: `${String(value)}s` };
		case "channel":
		case "role":
		case "user":
		case "enum":
			return isString(value) ? { ids: [value] } : null;
		case "boolean":
			return typeof value === "boolean" || isString(value) ? { ids: [String(value)] } : null;
		case "list":
			return Array.isArray(value) && value.every(isString) ? { ids: value } : null;
		case "toggles":
			return isBooleanRecord(value) ? { ids: toggledKeys(declared, value) } : null;
	}
}

/** A list of typed items is entered one item per line; `null` is the entry cleared. */
function typedListAnswer(value: unknown): Answer | null {
	if (value === null) {
		return { value: null };
	}
	if (!Array.isArray(value)) {
		return null;
	}
	return { value: value.map(String).join("\n") };
}

/**
 * The editor key a case is submitted to: the field's own key, or, for a
 * toggles field, the choice control offering its declared keys.
 */
function controlKey(adapter: Adapter, { kind, key }: ValueCase): string {
	if (kind !== "toggles") {
		return key;
	}
	const { spec } = valueCasesSettings.fields[key];
	const declaredKeys = spec.kind === "toggles" ? spec.keys : [];
	const control = choiceControls(adapter).find((entry) =>
		entry.choices.every((choice) => declaredKeys.includes(choice.value)),
	);
	if (control === undefined) {
		throw new Error(`No choice control for the toggles field "${key}"`);
	}
	return control.key;
}

function caseTitle({ kind, key, value }: ValueCase): string {
	return `${kind} ${key} = ${JSON.stringify(value)}`;
}

const SUBMITTED_CASES = VALUE_CASES.flatMap((valueCase) => {
	const answer = discordAnswer(valueCase);
	return answer === null ? [] : [{ valueCase, answer, title: caseTitle(valueCase) }];
});

describe("settingsEditorFromDeclaration", () => {
	describe("mapping of each field kind (research R10)", () => {
		it.each(["title", "count", "ratio", "cooldown", "accent", "apiKey"])(
			"maps %s to a typed text entry",
			async (key) => {
				const { adapter } = await setup(mappingSettings);
				expect(editable(adapter, key).field.kind).toBe("text");
			},
		);

		it("labels an entry with the field's label and describes it with its description", async () => {
			const { adapter } = await setup(mappingSettings);
			const { field: title } = editable(adapter, "title");
			expect(title.labelKey).toBe("mapping.title.label");
			expect(title.hintKey).toBe("mapping.title.hint");
		});

		it("prefills a typed entry with the stored value as text", async () => {
			const { adapter, subject } = await setup(mappingSettings, {
				title: "Hello",
				count: 7,
				ratio: 0.25,
			});
			expect(adapter.currentValue(subject, "title").text).toBe("Hello");
			expect(adapter.currentValue(subject, "count").text).toBe("7");
			expect(adapter.currentValue(subject, "ratio").text).toBe("0.25");
			expect(adapter.currentValue(subject, "accent").text).toBe("#5865f2");
		});

		it("parses a typed value on save and writes it through the service as the administrator", async () => {
			const { adapter, subject, service, store } = await setup(mappingSettings);
			await submit(adapter, subject, "count", { value: "8" });
			await submit(adapter, subject, "cooldown", { value: "1h30m" });
			await submit(adapter, subject, "ratio", { value: "0.5" });
			const values = await service.get(mappingSettings, GUILD);
			expect(values.count).toBe(8);
			expect(values.cooldown).toBe(5400);
			expect(values.ratio).toBe(0.5);
			expect((await store.read(GUILD, mappingSettings.id))?.updatedBy).toBe(ADMIN);
		});

		it("refuses an invalid value with the shared validator's error and writes nothing", async () => {
			const { adapter, subject, service, store } = await setup(mappingSettings);
			await expect(submit(adapter, subject, "count", { value: "42" })).rejects.toBeInstanceOf(
				SettingsValidationError,
			);
			expect(await store.read(GUILD, mappingSettings.id)).toBeNull();
			expect((await service.get(mappingSettings, GUILD)).count).toBe(3);
		});

		it("clears a typed value submitted empty", async () => {
			const { adapter, subject, service } = await setup(mappingSettings, { title: "Hello" });
			await submit(adapter, subject, "title", { value: null });
			expect((await service.get(mappingSettings, GUILD)).title).toBeUndefined();
		});

		it("keeps every typed value when its prefilled text is submitted back unchanged", async () => {
			const stored = { title: "Hello", count: 7, ratio: 0.25, cooldown: 5400, accent: "#112233" };
			const { adapter, subject, service } = await setup(mappingSettings, stored);
			for (const key of Object.keys(stored)) {
				await submit(adapter, subject, key, { value: adapter.currentValue(subject, key).text });
			}
			expect(await service.get(mappingSettings, GUILD)).toMatchObject(stored);
		});

		it("returns a subject that reflects the value just saved", async () => {
			const { adapter, subject } = await setup(mappingSettings);
			const written = await submit(adapter, subject, "count", { value: "9" });
			expect(written.assets).toEqual([]);
			expect(adapter.currentValue(written.subject, "count").text).toBe("9");
		});

		it("maps a boolean to a choice between two translated options", async () => {
			const { adapter, subject, service } = await setup(mappingSettings);
			const { field: enabled } = editable(adapter, "enabled");
			expect(enabled.kind).toBe("choice");
			const choices = enabled.kind === "choice" ? enabled.choices : [];
			expect(choices.map((choice) => choice.value)).toEqual(["true", "false"]);
			for (const choice of choices) {
				expect(choice.labelKey).not.toBe("");
			}
			expect(adapter.currentValue(subject, "enabled").picked).toEqual(["false"]);
			await submit(adapter, subject, "enabled", { ids: ["true"] });
			expect((await service.get(mappingSettings, GUILD)).enabled).toBe(true);
		});

		it("maps an enum to a choice offering its static options", async () => {
			const { adapter, subject, service } = await setup(mappingSettings, { region: "na" });
			const { field: region } = editable(adapter, "region");
			expect(region).toMatchObject({
				kind: "choice",
				choices: [
					{ value: "eu", labelKey: "mapping.region.eu" },
					{ value: "na", labelKey: "mapping.region.na" },
				],
			});
			expect(adapter.currentValue(subject, "region").picked).toEqual(["na"]);
			await submit(adapter, subject, "region", { ids: ["eu"] });
			expect((await service.get(mappingSettings, GUILD)).region).toBe("eu");
		});

		it("maps a role and a user to their own pickers", async () => {
			const { adapter, subject, service } = await setup(mappingSettings, {
				staffRole: STAFF_ROLE,
				owner: OWNER,
			});
			expect(editable(adapter, "staffRole").field.kind).toBe("role");
			expect(editable(adapter, "owner").field.kind).toBe("user");
			expect(adapter.currentValue(subject, "staffRole").picked).toEqual([STAFF_ROLE]);
			expect(adapter.currentValue(subject, "owner").picked).toEqual([OWNER]);
			await submit(adapter, subject, "staffRole", { ids: [MOD_ROLE] });
			expect((await service.get(mappingSettings, GUILD)).staffRole).toBe(MOD_ROLE);
		});

		it("maps a list of roles to a role picker bounded by the list's item counts", async () => {
			const { adapter, subject, service } = await setup(mappingSettings, { helpers: [STAFF_ROLE] });
			expect(editable(adapter, "helpers").field).toMatchObject({
				kind: "role",
				minValues: 1,
				maxValues: 3,
			});
			expect(adapter.currentValue(subject, "helpers").picked).toEqual([STAFF_ROLE]);
			await submit(adapter, subject, "helpers", { ids: [STAFF_ROLE, MOD_ROLE] });
			expect((await service.get(mappingSettings, GUILD)).helpers).toEqual([STAFF_ROLE, MOD_ROLE]);
		});

		it("maps a channel to a channel picker offering only its declared channel types", async () => {
			const { adapter, subject, service } = await setup(mappingSettings);
			expect(editable(adapter, "logChannel").field).toMatchObject({
				kind: "channel",
				channelTypes: [ChannelType.GuildText],
			});
			await submit(adapter, subject, "logChannel", { ids: [TEXT_CHANNEL_ID] });
			expect((await service.get(mappingSettings, GUILD)).logChannel).toBe(TEXT_CHANNEL_ID);
		});

		it("maps a channel restricted to categories to a category picker", async () => {
			const { adapter, subject, service } = await setup(mappingSettings);
			expect(editable(adapter, "ticketCategory").field.kind).toBe("category");
			await submit(adapter, subject, "ticketCategory", { ids: [CATEGORY_CHANNEL] });
			expect((await service.get(mappingSettings, GUILD)).ticketCategory).toBe(CATEGORY_CHANNEL);
		});
	});

	describe("lists of typed items", () => {
		const typedListsSettings = defineSettings({
			id: "typed-lists",
			version: 1,
			labels: { title: "typed-lists.title" },
			fields: {
				thresholds: field.list(field.integer({ min: 1 }), { label: "typed-lists.thresholds" }),
				keywords: field.list(field.text(), { label: "typed-lists.keywords" }),
			},
		});

		it("maps a list of integers or texts to a text entry holding one item per line", async () => {
			const { adapter, subject } = await setup(typedListsSettings, {
				thresholds: [1, 5],
				keywords: ["ticket", "help"],
			});
			expect(editable(adapter, "thresholds").field.kind).toBe("text");
			expect(adapter.currentValue(subject, "thresholds").text).toBe("1\n5");
			expect(adapter.currentValue(subject, "keywords").text).toBe("ticket\nhelp");
		});

		it("saves each non-empty trimmed line as one item", async () => {
			const { adapter, subject, service } = await setup(typedListsSettings);
			await submit(adapter, subject, "thresholds", { value: " 2 \n\n7\n" });
			await submit(adapter, subject, "keywords", { value: "ticket\n  \n help " });
			const values = await service.get(typedListsSettings, GUILD);
			expect(values.thresholds).toEqual([2, 7]);
			expect(values.keywords).toEqual(["ticket", "help"]);
		});

		it("clears a list submitted with no item", async () => {
			const { adapter, subject, service } = await setup(typedListsSettings, { keywords: ["a"] });
			await submit(adapter, subject, "keywords", { value: " \n " });
			expect((await service.get(typedListsSettings, GUILD)).keywords).toBeUndefined();
		});
	});

	describe("secrets", () => {
		it("shows a stored secret as set, never its value", async () => {
			const { adapter, subject } = await setup(mappingSettings, { apiKey: "s3cr3t" });
			const current = adapter.currentValue(subject, "apiKey");
			expect(current.text).toBe(SETTINGS_MESSAGES.secretSet);
			expect(JSON.stringify(current)).not.toContain("s3cr3t");
		});

		it("shows an unset secret as not set", async () => {
			const { adapter, subject } = await setup(mappingSettings);
			expect(adapter.currentValue(subject, "apiKey").text).toBe(SETTINGS_MESSAGES.secretNotSet);
		});

		it("never exposes the secret through the subject a save returns", async () => {
			const { adapter, subject } = await setup(mappingSettings);
			const written = await submit(adapter, subject, "apiKey", { value: "n3w-s3cr3t" });
			const current = adapter.currentValue(written.subject, "apiKey");
			expect(current.text).toBe(SETTINGS_MESSAGES.secretSet);
			expect(JSON.stringify(current)).not.toContain("n3w-s3cr3t");
		});

		it("replaces a secret with a new value", async () => {
			const { adapter, subject, service } = await setup(mappingSettings, { apiKey: "s3cr3t" });
			await submit(adapter, subject, "apiKey", { value: "n3w-s3cr3t" });
			expect((await service.get(mappingSettings, GUILD)).apiKey).toBe("n3w-s3cr3t");
		});

		it("clears a secret submitted empty", async () => {
			const { adapter, subject, service } = await setup(mappingSettings, { apiKey: "s3cr3t" });
			await submit(adapter, subject, "apiKey", { value: null });
			expect((await service.get(mappingSettings, GUILD)).apiKey).toBeUndefined();
		});

		it("keeps the stored secret when its prefilled state is submitted back unchanged", async () => {
			const { adapter, subject, service } = await setup(mappingSettings, { apiKey: "s3cr3t" });
			await submit(adapter, subject, "apiKey", {
				value: adapter.currentValue(subject, "apiKey").text,
			});
			expect((await service.get(mappingSettings, GUILD)).apiKey).toBe("s3cr3t");
		});
	});

	describe("stored entities missing from the guild", () => {
		it.each([
			["logChannel", DELETED_CHANNEL_ID],
			["staffRole", DELETED_ROLE_ID],
			["owner", LEFT_MEMBER],
		])("shows a stored %s missing from the guild directory as unavailable", async (key, id) => {
			const { adapter, subject } = await setup(mappingSettings, { [key]: id });
			const current = adapter.currentValue(subject, key);
			expect(current.picked).toEqual([]);
			expect(current.text).toBe(SETTINGS_MESSAGES.valueUnavailable);
		});

		it("keeps the available items of a list and flags the missing one", async () => {
			const { adapter, subject } = await setup(mappingSettings, {
				helpers: [STAFF_ROLE, DELETED_ROLE_ID],
			});
			const current = adapter.currentValue(subject, "helpers");
			expect(current.picked).toEqual([STAFF_ROLE]);
			expect(current.text).toBe(SETTINGS_MESSAGES.valueUnavailable);
		});

		it("does not flag an entity the guild still has", async () => {
			const { adapter, subject } = await setup(mappingSettings, { logChannel: TEXT_CHANNEL_ID });
			expect(adapter.currentValue(subject, "logChannel")).toMatchObject({
				picked: [TEXT_CHANNEL_ID],
			});
			expect(adapter.currentValue(subject, "logChannel").text).not.toBe(
				SETTINGS_MESSAGES.valueUnavailable,
			);
		});
	});

	describe("groups and order", () => {
		it("shows 8 fields in their 2 declared groups, in declared order", async () => {
			const { adapter } = await setup(groupedSettings);
			expect(adapter.fields.map((entry) => entry.kind)).toEqual(["group", "group"]);
			expect(adapter.fields.map((entry) => [entry.labelKey, entry.hintKey])).toEqual([
				["grouped.group.general", "grouped.group.general.hint"],
				["grouped.group.limits", "grouped.group.limits.hint"],
			]);
			const members = adapter.fields.map((entry) =>
				entry.kind === "group" ? entry.fields.map((member) => member.key) : [],
			);
			expect(members).toEqual([
				["title", "logChannel", "staffRole", "enabled"],
				["count", "cooldown", "region", "apiKey"],
			]);
		});

		it("keeps declared order when the declaration sets no order hint", async () => {
			const { adapter } = await setup(orderedSettings({}));
			expect(adapter.fields.map((entry) => entry.key)).toEqual(["intro", "first#1", "second#1"]);
			expect(editables(adapter).map(({ field: member }) => member.key)).toEqual([
				"intro",
				"a1",
				"a2",
				"b1",
			]);
		});

		it("puts the groups listed in ui.groupOrder first", async () => {
			const { adapter } = await setup(orderedSettings({ groupOrder: ["second"] }));
			expect(adapter.fields.map((entry) => entry.key)).toEqual(["intro", "second#1", "first#1"]);
		});

		it("orders groups by their own order", async () => {
			const { adapter } = await setup(orderedSettings({ firstOrder: 2, secondOrder: 1 }));
			expect(adapter.fields.map((entry) => entry.key)).toEqual(["intro", "second#1", "first#1"]);
		});

		it("orders fields by their ui.order within their group", async () => {
			const { adapter } = await setup(orderedSettings({ a2Order: 1 }));
			expect(editables(adapter).map(({ field: member }) => member.key)).toEqual([
				"intro",
				"a2",
				"a1",
				"b1",
			]);
		});

		it("saves a whole group in one write", async () => {
			const { adapter, subject, service, set } = await setup(groupedSettings);
			await submit(adapter, subject, "count", { value: "4" });
			expect(set).toHaveBeenCalledTimes(1);
			expect(await service.get(groupedSettings, GUILD)).toMatchObject({
				count: 4,
				cooldown: 60,
				region: "eu",
				enabled: true,
			});
		});

		it("writes only the members whose submitted value differs from the prefilled one", async () => {
			const { adapter, subject, set } = await setup(groupedSettings, { count: 5 });
			await submit(adapter, subject, "cooldown", { value: "2m" });
			expect(set).toHaveBeenCalledWith(
				groupedSettings,
				GUILD,
				{ cooldown: "2m" },
				expect.objectContaining({ userId: ADMIN }),
			);
		});

		it("keeps an unavailable picker and a stored secret left untouched in a group save", async () => {
			const { adapter, subject, store } = await setup(groupedSettings, {
				staffRole: DELETED_ROLE_ID,
				apiKey: "s3cr3t",
			});
			await submit(adapter, subject, "title", { value: "Hello" });
			await submit(adapter, subject, "count", { value: "4" });
			expect((await store.read(GUILD, groupedSettings.id))?.values).toMatchObject({
				title: "Hello",
				count: 4,
				staffRole: DELETED_ROLE_ID,
				apiKey: "s3cr3t",
			});
		});

		it("splits a group into chunks of at most 5 fields, keeping declared order", async () => {
			const { adapter } = await setup(manyFieldsSettings("chunked", [7]));
			const groups = adapter.fields.filter((entry) => entry.kind === "group");
			expect(groups.length).toBe(2);
			for (const group of groups) {
				expect(group.fields.length).toBeLessThanOrEqual(MAX_MODAL_COMPONENTS);
			}
			expect(editables(adapter).map((entry) => entry.field.key)).toEqual(numberedKeys("f", 7));
		});

		it("keeps a 45-field declaration within Discord's card limits by nesting groups as levels", async () => {
			const { adapter } = await setup(manyFieldsSettings("large", [12, 12, 12, 9]));
			const levels = levelFields(adapter);
			for (const fields of levels.values()) {
				expect(fields.length).toBeLessThanOrEqual(MAX_CARD_LEVEL_ENTRIES);
				for (const entry of fields) {
					if (entry.kind === "group") {
						expect(entry.fields.length).toBeLessThanOrEqual(MAX_MODAL_COMPONENTS);
					}
				}
			}
			const reached = [...levels.values()]
				.flat()
				.flatMap((entry) => (entry.kind === "level" ? [entry.levelKey] : []));
			// Every nested level is reached from exactly one entry, and none is left orphaned.
			expect([...reached].sort()).toEqual(
				[...levels.keys()].filter((key) => key !== "root").sort(),
			);
			expect(editables(adapter).map((entry) => entry.field.key)).toEqual(numberedKeys("f", 45));
		});
	});

	describe("toggles", () => {
		it("maps a toggles field to one control listing its declared keys with their labels", async () => {
			const { adapter } = await setup(togglesSettings);
			const controls = choiceControls(adapter);
			expect(controls.length).toBe(1);
			expect(controls[0]).toMatchObject({
				minValues: 0,
				maxValues: TOGGLE_KEYS.length,
				choices: [
					{ value: "alpha", labelKey: "toggled.alpha" },
					{ value: "beta", labelKey: "toggled.beta" },
					{ value: "gamma", labelKey: "toggled.gamma" },
				],
			});
		});

		it("reads the current state from the full boolean record, defaults included", async () => {
			const { adapter, subject } = await setup(togglesSettings, { features: { alpha: true } });
			const [control] = choiceControls(adapter);
			expect(adapter.currentValue(subject, control?.key ?? "").picked).toEqual(["alpha", "beta"]);
		});

		it("saves the picked keys as a full boolean record", async () => {
			const { adapter, subject, service, set } = await setup(togglesSettings);
			const [control] = choiceControls(adapter);
			await submit(adapter, subject, control?.key ?? "", { ids: ["alpha", "gamma"] });
			const full = { alpha: true, beta: false, gamma: true };
			expect(set).toHaveBeenCalledWith(
				togglesSettings,
				GUILD,
				{ features: full },
				expect.objectContaining({ guildId: GUILD, userId: ADMIN }),
			);
			expect((await service.get(togglesSettings, GUILD)).features).toEqual(full);
		});

		it("splits more than 25 keys into selects of at most 25 options without losing any key", async () => {
			const { adapter } = await setup(manyTogglesSettings);
			const controls = choiceControls(adapter);
			expect(controls.length).toBeGreaterThan(1);
			for (const control of controls) {
				expect(control.choices.length).toBeLessThanOrEqual(MAX_SELECT_OPTIONS);
				expect(control.maxValues).toBeLessThanOrEqual(control.choices.length);
			}
			const offered = controls.flatMap((control) => control.choices);
			expect(offered.map((choice) => choice.value)).toEqual(MANY_TOGGLE_KEYS);
			expect(offered.map((choice) => choice.labelKey)).toEqual(
				MANY_TOGGLE_KEYS.map((key) => `many-toggles.${key}`),
			);
		});

		it("keeps the keys of the other selects when one select of a split toggles field is saved", async () => {
			const { adapter, subject, service } = await setup(manyTogglesSettings, {
				modules: { k01: true, k30: true },
			});
			const controls = choiceControls(adapter);
			const first = controls[0];
			const last = controls[controls.length - 1];
			expect(adapter.currentValue(subject, last?.key ?? "").picked).toContain("k30");
			await submit(adapter, subject, first?.key ?? "", { ids: ["k02"] });
			const expected = Object.fromEntries(
				MANY_TOGGLE_KEYS.map((key) => [key, key === "k02" || key === "k30"]),
			);
			expect((await service.get(manyTogglesSettings, GUILD)).modules).toEqual(expected);
		});
	});

	describe("reset", () => {
		it("clears every stored value back to its default", async () => {
			const { adapter, subject, service } = await setup(mappingSettings, {
				count: 7,
				apiKey: "s3cr3t",
				enabled: true,
			});
			const written = await adapter.reset(subject);
			const values = await service.get(mappingSettings, GUILD);
			expect(values).toMatchObject({ count: 3, enabled: false });
			expect(values.apiKey).toBeUndefined();
			expect(adapter.currentValue(written.subject, "count").text).toBe("3");
		});
	});

	describe("agreement with the settings service (SC-002)", () => {
		it.each(SUBMITTED_CASES)("$title", async ({ valueCase, answer }) => {
			const adapterStore = await createStore(valueCasesSettings, VALUE_CASES_BASELINE);
			const adapterService = createService({
				store: adapterStore,
				guilds: createInMemoryGuildDirectory(VALUE_CASES_DIRECTORY_SEED),
			});
			const adapter = await settingsEditorFromDeclaration(valueCasesSettings, adapterService, {
				...CONTEXT,
				guildId: VALUE_CASES_GUILD,
			});
			const subject = adapter.initial.subject;
			const viaAdapter = await writeOutcome(
				submit(adapter, subject, controlKey(adapter, valueCase), answer),
			);

			const serviceStore = await createStore(valueCasesSettings, VALUE_CASES_BASELINE);
			const service = createService({
				store: serviceStore,
				guilds: createInMemoryGuildDirectory(VALUE_CASES_DIRECTORY_SEED),
			});
			const viaService = await writeOutcome(
				service.set(
					valueCasesSettings,
					VALUE_CASES_GUILD,
					{ [valueCase.key]: valueCase.value },
					{ guildId: VALUE_CASES_GUILD, userId: ADMIN, locale: LOCALE },
				),
			);

			expect(viaService).toStrictEqual(expectedOutcome(valueCase));
			expect(viaAdapter).toStrictEqual(viaService);
		});

		it("leaves out only the cases no Discord answer can express", () => {
			const unexpressed = VALUE_CASES.filter((valueCase) => discordAnswer(valueCase) === null).map(
				({ key, value }) => ({ key, value }),
			);
			expect(unexpressed).toStrictEqual([
				// A picker only yields ids.
				{ key: "logChannel", value: 123 },
				{ key: "owner", value: true },
				// A typed entry only yields text: a non-string string-kind value, a string numeric value.
				{ key: "accent", value: 0xff0000 },
				{ key: "maxOpen", value: "3" },
				{ key: "ratio", value: "0.5" },
				{ key: "greeting", value: 42 },
				{ key: "nickname", value: [] },
				{ key: "apiKey", value: 123 },
				// A list picker only yields an array of ids (also `moderators = ""` below).
				{ key: "watchedChannels", value: 5 },
				{ key: "watchedChannels", value: TEXT_CHANNEL },
				{ key: "moderators", value: "" },
				// A toggles select only yields the keys left on.
				{ key: "features", value: "tickets" },
				{ key: "features", value: ["tickets"] },
				{ key: "features", value: { tickets: "on" } },
			]);
		});
	});

	describe("searchable fields (FR-026a)", () => {
		/** 30 zones, `Zone/00` to `Zone/29`, named `Zone 00`…: more than one select holds. */
		const ZONES: readonly Choice[] = Array.from({ length: 30 }, (_, index) => {
			const number = String(index).padStart(2, "0");
			return { name: `Zone ${number}`, value: `Zone/${number}` };
		});

		function createSearches() {
			return {
				zones: vi.fn(async (query: string, _ctx: SuggestionContext) =>
					ZONES.filter((zone) => String(zone.value).startsWith(query)),
				),
				zoneLabel: vi.fn(
					async (value: string, _ctx: SuggestionContext) =>
						ZONES.find((zone) => zone.value === value)?.name,
				),
				cities: vi.fn(
					async (_query: string, _ctx: SuggestionContext): Promise<readonly Choice[]> => [
						{ name: "Paris", value: "paris" },
						{ name: "Lyon", value: "lyon" },
					],
				),
				sizes: vi.fn(
					async (_query: string, _ctx: SuggestionContext): Promise<readonly Choice[]> => [
						{ name: "Small", value: 1 },
						{ name: "Large", value: 10 },
					],
				),
			};
		}

		function searchableSettings(searches: ReturnType<typeof createSearches>) {
			return defineSettings({
				id: "searchable",
				version: 1,
				labels: { title: "searchable.title" },
				groups: { place: { label: "searchable.group.place" } },
				fields: {
					timezone: field.text({
						label: "searchable.timezone",
						description: "searchable.timezone.hint",
						suggest: { resolve: searches.zones, label: searches.zoneLabel, strict: true },
					}),
					city: field.text({
						label: "searchable.city",
						description: "searchable.city.hint",
						suggest: { resolve: searches.cities },
					}),
					first: field.text({ label: "searchable.first", ui: { group: "place" } }),
					second: field.text({ label: "searchable.second", ui: { group: "place" } }),
					third: field.text({ label: "searchable.third", ui: { group: "place" } }),
					fourth: field.text({ label: "searchable.fourth", ui: { group: "place" } }),
					size: field.integer({
						label: "searchable.size",
						suggest: { resolve: searches.sizes },
						ui: { group: "place" },
					}),
					apiKey: field.secret({ label: "searchable.api-key" }),
				},
			});
		}

		async function setupSearchable(stored?: Record<string, unknown>) {
			const searches = createSearches();
			const declaration = searchableSettings(searches);
			return { searches, declaration, ...(await setup(declaration, stored)) };
		}

		function choiceField(adapter: Adapter, key: string): SettingsEditorChoiceField<string> {
			const { field: entry } = editable(adapter, key);
			if (entry.kind !== "choice") {
				throw new Error(`"${key}" is a ${entry.kind} entry, not a choice`);
			}
			return entry;
		}

		/** What each option of a choice shows, as the modal translates it. */
		function optionLabels(entry: SettingsEditorChoiceField<string>): string[] {
			return entry.choices.map((choice) => String(choice.labelParams?.label));
		}

		it("maps a strict searchable field to a choice of the first 25 results for an empty query", async () => {
			const { adapter, searches } = await setupSearchable({ apiKey: "hunter2" });
			const timezone = choiceField(adapter, "timezone");

			expect(timezone).toMatchObject({
				labelKey: "searchable.timezone",
				hintKey: "searchable.timezone.hint",
				minValues: 0,
				maxValues: 1,
			});
			expect(timezone.choices).toHaveLength(MAX_SELECT_OPTIONS);
			expect(timezone.choices[0]).toStrictEqual({
				value: "Zone/00",
				labelKey: SETTINGS_EDITOR_MESSAGES.choiceLabel,
				labelParams: { label: "Zone 00" },
			});
			expect(optionLabels(timezone)).toStrictEqual(
				ZONES.slice(0, MAX_SELECT_OPTIONS).map((zone) => zone.name),
			);
			expect(editable(adapter, "timezone").group).toBeNull();
			expect(searches.zones).toHaveBeenCalledWith("", {
				guildId: GUILD,
				userId: ADMIN,
				locale: LOCALE,
				values: expect.objectContaining({ apiKey: { isSet: true } }),
			});
		});

		it("offers no free entry for a strict field", async () => {
			const { adapter } = await setupSearchable();
			expect(editables(adapter).map((entry) => entry.field.key)).not.toContain(
				`timezone${OTHER_VALUE_SUFFIX}`,
			);
		});

		it("saves the picked result, and refuses a value the strict search does not know", async () => {
			const { adapter, subject, service, declaration } = await setupSearchable();

			await submit(adapter, subject, "timezone", { ids: ["Zone/04"] });
			expect((await service.get(declaration, GUILD)).timezone).toBe("Zone/04");

			const refused = submit(adapter, subject, "timezone", { ids: ["Mars/Olympus"] });
			await expect(refused).rejects.toBeInstanceOf(SettingsValidationError);
			await expect(refused).rejects.toMatchObject({
				issues: [expect.objectContaining({ field: "timezone", code: "unknownChoice" })],
			});
		});

		it("keeps a current value the first results miss as an option, so saving it back keeps it", async () => {
			const { adapter, subject, service, declaration } = await setupSearchable({
				timezone: "Zone/29",
			});
			const timezone = choiceField(adapter, "timezone");

			expect(timezone.choices).toHaveLength(MAX_SELECT_OPTIONS);
			expect(timezone.choices[0]).toMatchObject({ value: "Zone/29" });
			expect(optionLabels(timezone)[0]).toBe("Zone 29");
			expect(adapter.currentValue(subject, "timezone").picked).toStrictEqual(["Zone/29"]);
			await submit(adapter, subject, "timezone", { ids: ["Zone/29"] });
			expect((await service.get(declaration, GUILD)).timezone).toBe("Zone/29");
		});

		it("gives a non-strict field one entry whose modal offers the results and a free entry", async () => {
			const { adapter } = await setupSearchable();
			const city = editable(adapter, "city");
			const other = editable(adapter, `city${OTHER_VALUE_SUFFIX}`);

			expect(city.group).not.toBeNull();
			expect(city.group).toBe(other.group);
			expect(city.group).toMatchObject({
				kind: "group",
				labelKey: "searchable.city",
				hintKey: "searchable.city.hint",
			});
			expect(city.group?.fields.map((member) => member.key)).toStrictEqual([
				"city",
				`city${OTHER_VALUE_SUFFIX}`,
			]);
			expect(optionLabels(choiceField(adapter, "city"))).toStrictEqual(["Paris", "Lyon"]);
			expect(other.field).toMatchObject({
				kind: "text",
				labelKey: SETTINGS_EDITOR_MESSAGES.otherValue,
				helperKey: SETTINGS_EDITOR_MESSAGES.otherValueHelper,
			});
		});

		it("saves a pick, or a typed value the list does not offer, validated on save", async () => {
			const { adapter, subject, service, declaration } = await setupSearchable();

			await submit(adapter, subject, "city", { ids: ["lyon"] });
			expect((await service.get(declaration, GUILD)).city).toBe("lyon");

			const written = await submit(adapter, subject, `city${OTHER_VALUE_SUFFIX}`, {
				value: "Atlantis",
			});
			expect((await service.get(declaration, GUILD)).city).toBe("Atlantis");
			expect(adapter.currentValue(written.subject, `city${OTHER_VALUE_SUFFIX}`).text).toBeNull();
		});

		it("writes nothing when the modal comes back as it opened", async () => {
			const { adapter, subject, set } = await setupSearchable({ city: "paris" });
			expect(adapter.currentValue(subject, "city").picked).toStrictEqual(["paris"]);

			await submit(adapter, subject, "city", { ids: ["paris"] });

			expect(set).not.toHaveBeenCalled();
		});

		it("keeps a non-strict field's select and free entry in the same modal of its group", async () => {
			const { adapter } = await setupSearchable();
			const size = editable(adapter, "size");

			expect(size.group?.labelKey).toBe("searchable.group.place");
			expect(size.group).toBe(editable(adapter, `size${OTHER_VALUE_SUFFIX}`).group);
			expect(size.group?.fields.length).toBeLessThanOrEqual(MAX_MODAL_COMPONENTS);
			expect(editable(adapter, "first").group).not.toBe(size.group);
		});

		it("stores a numeric field's pick and typed value as numbers", async () => {
			const { adapter, subject, service, declaration } = await setupSearchable();

			await submit(adapter, subject, "size", { ids: ["10"] });
			expect((await service.get(declaration, GUILD)).size).toBe(10);

			await submit(adapter, subject, `size${OTHER_VALUE_SUFFIX}`, { value: "7" });
			expect((await service.get(declaration, GUILD)).size).toBe(7);
		});

		it("falls back to a typed entry when the search offers nothing", async () => {
			const { adapter, subject, service, declaration, searches } = await (async () => {
				const failing = createSearches();
				failing.cities.mockRejectedValue(new Error("backend down"));
				const failingDeclaration = searchableSettings(failing);
				return {
					searches: failing,
					declaration: failingDeclaration,
					...(await setup(failingDeclaration)),
				};
			})();

			expect(searches.cities).toHaveBeenCalled();
			expect(editable(adapter, "city")).toMatchObject({ field: { kind: "text" }, group: null });
			await submit(adapter, subject, "city", { value: "Atlantis" });
			expect((await service.get(declaration, GUILD)).city).toBe("Atlantis");
		});

		it("shows the search's label as the current value, and the free entry shows none", async () => {
			const { adapter, subject } = await setupSearchable({ timezone: "Zone/03", city: "Atlantis" });
			if (adapter.displayValue === undefined) {
				throw new Error("The adapter must provide displayValue");
			}

			expect(adapter.displayValue(subject, "timezone")).toBe("Zone 03");
			expect(adapter.displayValue(subject, "city")).toBe("Atlantis");
			expect(adapter.displayValue(subject, `city${OTHER_VALUE_SUFFIX}`)).toBeNull();
		});

		it("shows the label of a value saved on the screen", async () => {
			const { adapter, subject } = await setupSearchable();
			const written = await submit(adapter, subject, "timezone", { ids: ["Zone/07"] });

			expect(adapter.displayValue?.(written.subject, "timezone")).toBe("Zone 07");
		});
	});

	describe("displayValue", () => {
		function shown(adapter: Adapter, subject: unknown, key: string): string | null {
			if (adapter.displayValue === undefined) {
				throw new Error("The adapter must provide displayValue");
			}
			return adapter.displayValue(subject, key);
		}

		it("shows a channel, a category, a role and a member as Discord mentions", async () => {
			const { adapter, subject } = await setup(mappingSettings, {
				logChannel: TEXT_CHANNEL_ID,
				ticketCategory: CATEGORY_CHANNEL,
				staffRole: STAFF_ROLE,
				owner: OWNER,
			});
			expect(shown(adapter, subject, "logChannel")).toBe(`<#${TEXT_CHANNEL_ID}>`);
			expect(shown(adapter, subject, "ticketCategory")).toBe(`<#${CATEGORY_CHANNEL}>`);
			expect(shown(adapter, subject, "staffRole")).toBe(`<@&${STAFF_ROLE}>`);
			expect(shown(adapter, subject, "owner")).toBe(`<@${OWNER}>`);
		});

		it.each([
			["logChannel", DELETED_CHANNEL_ID],
			["staffRole", DELETED_ROLE_ID],
			["owner", LEFT_MEMBER],
		])("shows a stored %s missing from the guild as unavailable", async (key, id) => {
			const { adapter, subject } = await setup(mappingSettings, { [key]: id });
			expect(shown(adapter, subject, key)).toBe(SETTINGS_MESSAGES.valueUnavailable);
		});

		it("joins a list of roles, an unavailable one included", async () => {
			const { adapter, subject } = await setup(mappingSettings, {
				helpers: [STAFF_ROLE, DELETED_ROLE_ID],
			});
			expect(shown(adapter, subject, "helpers")).toBe(
				`<@&${STAFF_ROLE}>, ${SETTINGS_MESSAGES.valueUnavailable}`,
			);
		});

		it("shows an enum as its choice label and a boolean as its translated option", async () => {
			const { adapter, subject } = await setup(mappingSettings, { enabled: true, region: "na" });
			expect(shown(adapter, subject, "region")).toBe("mapping.region.na");
			expect(shown(adapter, subject, "enabled")).toBe(SETTINGS_MESSAGES.booleanTrue);
			const { adapter: other, subject: defaults } = await setup(mappingSettings);
			expect(shown(other, defaults, "enabled")).toBe(SETTINGS_MESSAGES.booleanFalse);
		});

		it("shows a set secret as set, never its value", async () => {
			const { adapter, subject } = await setup(mappingSettings, { apiKey: "s3cr3t" });
			const text = shown(adapter, subject, "apiKey");
			expect(text).toBe(SETTINGS_MESSAGES.secretSet);
			expect(text).not.toContain("s3cr3t");
		});

		it("shows an unset secret as not set", async () => {
			const { adapter, subject } = await setup(mappingSettings);
			expect(shown(adapter, subject, "apiKey")).toBe(SETTINGS_MESSAGES.secretNotSet);
		});

		it("shows a duration formatted, a colour as its hex and numbers as they are", async () => {
			const { adapter, subject } = await setup(mappingSettings, {
				cooldown: 5400,
				count: 7,
				ratio: 0.25,
			});
			expect(shown(adapter, subject, "cooldown")).toBe("1h30m");
			expect(shown(adapter, subject, "accent")).toBe("#5865f2");
			expect(shown(adapter, subject, "count")).toBe("7");
			expect(shown(adapter, subject, "ratio")).toBe("0.25");
		});

		it("shows a text as is, cut with an ellipsis when long", async () => {
			const { adapter, subject } = await setup(mappingSettings, { title: "Hello" });
			expect(shown(adapter, subject, "title")).toBe("Hello");
			const long = await setup(mappingSettings, { title: "x".repeat(200) });
			const text = shown(long.adapter, long.subject, "title") ?? "";
			expect(text.length).toBeLessThan(200);
			expect(text.endsWith("…")).toBe(true);
		});

		it("shows an unset value as not set", async () => {
			const { adapter, subject } = await setup(mappingSettings);
			expect(shown(adapter, subject, "title")).toBe(SETTINGS_MESSAGES.valueNotSet);
			expect(shown(adapter, subject, "staffRole")).toBe(SETTINGS_MESSAGES.valueNotSet);
			expect(shown(adapter, subject, "ratio")).toBe(SETTINGS_MESSAGES.valueNotSet);
		});

		it("joins a list of typed items", async () => {
			const typedLists = defineSettings({
				id: "typed-lists-shown",
				version: 1,
				labels: { title: "typed-lists-shown.title" },
				fields: {
					thresholds: field.list(field.integer({ min: 1 }), { label: "t.thresholds" }),
					keywords: field.list(field.text(), { label: "t.keywords" }),
				},
			});
			const { adapter, subject } = await setup(typedLists, {
				thresholds: [1, 5],
				keywords: ["ticket", "help"],
			});
			expect(shown(adapter, subject, "thresholds")).toBe("1, 5");
			expect(shown(adapter, subject, "keywords")).toBe("ticket, help");
		});

		it("shows the labels of the toggles that are on, or none", async () => {
			const { adapter, subject } = await setup(togglesSettings, { features: { alpha: true } });
			const [control] = choiceControls(adapter);
			expect(shown(adapter, subject, control?.key ?? "")).toBe("toggled.alpha, toggled.beta");
			const off = await setup(togglesSettings, { features: { beta: false } });
			expect(shown(off.adapter, off.subject, control?.key ?? "")).toBe(SETTINGS_MESSAGES.valueNone);
		});

		it("follows the subject a save returns", async () => {
			const { adapter, subject } = await setup(mappingSettings);
			const written = await submit(adapter, subject, "count", { value: "9" });
			expect(shown(adapter, written.subject, "count")).toBe("9");
		});
	});
});
