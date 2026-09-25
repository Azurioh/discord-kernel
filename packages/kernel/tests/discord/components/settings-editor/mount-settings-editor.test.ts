import { Collection, ComponentType, EmbedBuilder } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { fixedClock } from "@/clock";
import { mountSettingsEditor } from "@/discord/components/settings-editor/mount-settings-editor";
import {
	editorComponentIds,
	type SettingsEditorCardChrome,
	type SettingsEditorEmbedsChrome,
} from "@/discord/components/settings-editor/settings-editor.view";
import { textFieldValue } from "@/discord/components/settings-editor/settings-editor-field-values";
import type { SettingsEditorField } from "@/discord/components/settings-editor/settings-editor-fields";
import { ValidationError } from "@/errors/business-error";
import type { Locale } from "@/i18n/locale";
import type { Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";
import { createFakeLogger } from "../../../support/fake-logger";

const OWNER = "admin-1";
const IDS = editorComponentIds("mount-test");
const LOCALE: Locale = "en";
const CLOCK = fixedClock(new Date("2026-02-03T10:00:00.000Z"));

/** Echoes the key, so an assertion names the string the screen asked for. */
const translator = { translate: (_locale: Locale, key: string) => key } as unknown as Translator;

interface Subject {
	readonly name: string;
}

type Field = "name";

const FIELDS: readonly SettingsEditorField<Field>[] = [
	{
		key: "name",
		labelKey: "field.label",
		hintKey: "field.hint",
		kind: "text",
		style: "short",
		maxLength: 100,
	},
];

function noAttachments(): Collection<string, { name: string }> {
	return new Collection();
}

/** A click on one of the editor's own buttons, by custom id. */
function createClick(customId: string) {
	const update = vi.fn(async () => undefined);
	return {
		update,
		interaction: {
			customId,
			user: { id: OWNER },
			update,
			isButton: () => true,
			isAnySelectMenu: () => false,
			message: { attachments: noAttachments() },
		},
	};
}

interface MountOptions {
	readonly onWritten: () => Promise<void>;
	readonly logger: Logger;
}

/**
 * Mount a minimal, one-field embeds-layout editor — just enough to drive
 * `applyChange` through the reset button, the shortest path to it — and hand
 * back the collector's `collect` plus the store the screen writes state
 * through.
 */
async function mountTestEditor(options: MountOptions) {
	const response = {
		createMessageComponentCollector: vi.fn(() => ({
			on: (event: string, handler: (arg: unknown) => unknown) => {
				handlers.set(event, handler);
			},
			off: (event: string) => {
				handlers.delete(event);
			},
			stop: () => {
				void handlers.get("end")?.(undefined);
			},
		})),
	};
	const handlers = new Map<string, (arg: unknown) => unknown>();
	const editReply = vi.fn(async () => response);
	const interaction = {
		user: { id: OWNER },
		client: { user: { displayAvatarURL: () => "https://cdn.example.test/bot.png" } },
		editReply,
	} as unknown as Parameters<typeof mountSettingsEditor>[0];

	const chrome: SettingsEditorEmbedsChrome<Subject, never> = {
		titleKey: "screen.title",
		selectPlaceholderKey: "screen.placeholder",
		// Rendered unconditionally, so the reset button — the shortest path to
		// `applyChange` — is always on screen to click.
		hasOverrides: () => true,
		preview: (state) => new EmbedBuilder().setDescription(state.subject.name),
		filesOf: () => [],
	};

	const screen = await mountSettingsEditor<Subject, never, Field>(interaction, {
		ids: IDS,
		fields: FIELDS,
		initial: { subject: { name: "before" }, assets: [] },
		currentValue: () => textFieldValue(null),
		save: async (subject) => ({ subject, assets: [] }),
		reset: async () => ({ subject: { name: "after" }, assets: [] }),
		chrome,
		onWritten: options.onWritten,
		translator,
		locale: LOCALE,
		clock: CLOCK,
		logger: options.logger,
	});

	return {
		screen,
		collect: (clicked: unknown) => handlers.get("collect")?.(clicked),
	};
}

/** Arm and confirm the reset — the write `applyChange` folds `onWritten` around. */
async function resetThroughConfirmation(collect: (clicked: unknown) => unknown): Promise<void> {
	await collect(createClick(IDS.reset).interaction);
	await collect(createClick(IDS.resetConfirm).interaction);
}

describe("mountSettingsEditor: onWritten's failure after a successful write", () => {
	/**
	 * The write already landed by the time `onWritten` runs — see
	 * `applyChange`'s own doc. A `BusinessError` out of the hook is not a
	 * refusal to write, and must not be folded into one: the administrator
	 * would then be told their change was rejected when it was not, the worst
	 * of both outcomes.
	 */
	it("still confirms the write, carrying the new subject, when onWritten throws", async () => {
		const logger = createFakeLogger();
		const onWritten = vi.fn(async () => {
			throw new ValidationError("refresh failed");
		});
		const { screen, collect } = await mountTestEditor({ onWritten, logger });

		await resetThroughConfirmation(collect);

		const state = screen.store.read();
		expect(onWritten).toHaveBeenCalledTimes(1);
		expect(state.subject).toEqual({ name: "after" });
		expect(state.notice).toEqual({ text: expect.any(String), tone: "confirmation" });
	});

	/** Logged rather than shown or re-thrown — an incident to trace, not a message to hand back. */
	it("logs onWritten's failure instead of showing or re-throwing it", async () => {
		const logger = createFakeLogger();
		const failure = new ValidationError("refresh failed");
		const onWritten = vi.fn(async () => {
			throw failure;
		});
		const { collect } = await mountTestEditor({ onWritten, logger });

		await expect(resetThroughConfirmation(collect)).resolves.toBeUndefined();

		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ err: expect.anything() }),
			expect.stringContaining("onWritten"),
		);
	});

	it("carries the new subject and a confirmation notice when onWritten succeeds", async () => {
		const logger = createFakeLogger();
		const onWritten = vi.fn(async () => undefined);
		const { screen, collect } = await mountTestEditor({ onWritten, logger });

		await resetThroughConfirmation(collect);

		const state = screen.store.read();
		expect(state.subject).toEqual({ name: "after" });
		expect(state.notice?.tone).toBe("confirmation");
		expect(logger.error).not.toHaveBeenCalled();
	});
});

describe("mountSettingsEditor: a card layout's per-entry button icon", () => {
	type IconField = "withIcon" | "withoutIcon";
	interface IconSubject {
		readonly name: string;
	}

	const ICON_FIELDS: readonly SettingsEditorField<IconField>[] = [
		{
			key: "withIcon",
			labelKey: "field.withIcon.label",
			hintKey: "field.withIcon.hint",
			kind: "text",
			style: "short",
			maxLength: 10,
			icon: "🎯",
		},
		{
			key: "withoutIcon",
			labelKey: "field.withoutIcon.label",
			hintKey: "field.withoutIcon.hint",
			kind: "text",
			style: "short",
			maxLength: 10,
		},
	];

	interface SectionJson {
		readonly type: number;
		readonly accessory?: {
			readonly custom_id?: string;
			readonly emoji?: { readonly name?: string };
		};
	}

	/** Mount a minimal card-layout screen and hand back the first render's own container. */
	async function mountIconScreen() {
		const response = {
			createMessageComponentCollector: vi.fn(() => ({
				on: () => undefined,
				off: () => undefined,
				stop: () => undefined,
			})),
		};
		const editReply = vi.fn(
			async (payload: { components: { toJSON(): { components: SectionJson[] } }[] }) => {
				void payload;
				return response;
			},
		);
		const interaction = {
			user: { id: OWNER },
			client: { user: { displayAvatarURL: () => "https://cdn.example.test/bot.png" } },
			editReply,
		} as unknown as Parameters<typeof mountSettingsEditor>[0];

		const chrome: SettingsEditorCardChrome<IconSubject, never> = {
			layout: "card",
			titleKey: "screen.title",
			preview: () => [],
			filesOf: () => [],
		};

		await mountSettingsEditor<IconSubject, never, IconField>(interaction, {
			ids: editorComponentIds("icon-test"),
			fields: ICON_FIELDS,
			initial: { subject: { name: "x" }, assets: [] },
			currentValue: () => textFieldValue(null),
			save: async (subject) => ({ subject, assets: [] }),
			reset: async (subject) => ({ subject, assets: [] }),
			chrome,
			translator,
			locale: LOCALE,
			clock: CLOCK,
			logger: createFakeLogger(),
		});

		const payload = editReply.mock.calls[0]?.[0];
		const [container] = payload?.components ?? [];
		if (container === undefined) {
			throw new Error("Rendered message carries no card container.");
		}
		return container
			.toJSON()
			.components.filter((block): block is SectionJson => block.type === ComponentType.Section);
	}

	/**
	 * An entry declaring its own `icon` carries it on the button the card
	 * layout builds for it; an entry declaring none keeps the generic pencil —
	 * exactly what every entry wore before `icon` existed.
	 */
	it("wears the declared icon, and falls back to the generic pencil when none is declared", async () => {
		const [withIcon, withoutIcon] = await mountIconScreen();

		expect(withIcon?.accessory?.emoji?.name).toBe("🎯");
		expect(withoutIcon?.accessory?.emoji?.name).toBe("✏️");
	});
});

describe("mountSettingsEditor: a card layout's displayValue hook", () => {
	/** Every text the payload renders, serialised, so an assertion can look for one value. */
	function renderedText(payload: unknown): string {
		const { components } = payload as { components: { toJSON(): unknown }[] };
		return JSON.stringify(components.map((component) => component.toJSON()));
	}

	it("shows the current value on the card and refreshes it after a write", async () => {
		const handlers = new Map<string, (arg: unknown) => unknown>();
		const response = {
			createMessageComponentCollector: vi.fn(() => ({
				on: (event: string, handler: (arg: unknown) => unknown) => {
					handlers.set(event, handler);
				},
				off: () => undefined,
				stop: () => undefined,
			})),
		};
		const editReply = vi.fn(async (payload: unknown) => {
			void payload;
			return response;
		});
		const interaction = {
			user: { id: OWNER },
			client: { user: { displayAvatarURL: () => "https://cdn.example.test/bot.png" } },
			editReply,
		} as unknown as Parameters<typeof mountSettingsEditor>[0];
		const chrome: SettingsEditorCardChrome<Subject, never> = {
			layout: "card",
			titleKey: "screen.title",
			hasOverrides: () => true,
			preview: () => [],
			filesOf: () => [],
		};

		await mountSettingsEditor<Subject, never, Field>(interaction, {
			ids: IDS,
			fields: FIELDS,
			initial: { subject: { name: "value-before" }, assets: [] },
			currentValue: () => textFieldValue(null),
			displayValue: (subject) => subject.name,
			save: async (subject) => ({ subject, assets: [] }),
			reset: async () => ({ subject: { name: "value-after" }, assets: [] }),
			chrome,
			// Keeps the params, so the value the "Current" line carries shows.
			translator: {
				translate: (_locale: Locale, key: string, params?: Record<string, string>) =>
					`${key}${JSON.stringify(params ?? {})}`,
			} as unknown as Translator,
			locale: LOCALE,
			clock: CLOCK,
			logger: makeLogger(),
		});
		expect(renderedText(editReply.mock.calls[0]?.[0])).toContain("value-before");

		const collect = (clicked: unknown) => handlers.get("collect")?.(clicked);
		await collect(createClick(IDS.reset).interaction);
		const confirm = createClick(IDS.resetConfirm);
		await collect(confirm.interaction);

		const updated = renderedText((confirm.update.mock.calls as unknown[][])[0]?.[0]);
		expect(updated).toContain("value-after");
		expect(updated).not.toContain("value-before");
	});
});
