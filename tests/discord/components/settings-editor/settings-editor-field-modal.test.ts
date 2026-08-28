import { Collection, type MessageComponentInteraction, type ModalBuilder } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
	promptEditorFieldValue,
	promptEditorGroupValue,
	type SettingsEditorSubmission,
} from "@/discord/components/settings-editor/settings-editor-field-modal";
import {
	type SettingsEditorGroupField,
	type SettingsEditorValueField,
	textFieldValue,
} from "@/discord/components/settings-editor/settings-editor-fields";
import type { Locale, Translator } from "@/i18n";

const LOCALE: Locale = "en";

/** Echoes the key, matching the convention `settings-editor-view.test.ts` uses. */
const translator = { translate: (_locale: Locale, key: string) => key } as unknown as Translator;

type FieldKey = "gameAdd" | "requestDate";

const gameAddField: SettingsEditorValueField<FieldKey> = {
	key: "gameAdd",
	labelKey: "gameAdd.label",
	hintKey: "gameAdd.hint",
	kind: "text",
	style: "short",
	maxLength: 100,
};

const requestDateField: SettingsEditorValueField<FieldKey> = {
	key: "requestDate",
	labelKey: "requestDate.label",
	hintKey: "requestDate.hint",
	kind: "text",
	style: "short",
	maxLength: 100,
};

type GroupMemberKey = "announcement" | "title" | "reviewerRole";

const announcementGroup: SettingsEditorGroupField<GroupMemberKey> = {
	key: "announcement",
	labelKey: "announcement.label",
	hintKey: "announcement.hint",
	kind: "group",
	fields: [
		{
			key: "title",
			labelKey: "title.label",
			hintKey: "title.hint",
			kind: "text",
			style: "short",
			maxLength: 100,
		},
		{
			key: "reviewerRole",
			labelKey: "reviewerRole.label",
			hintKey: "reviewerRole.hint",
			kind: "role",
		},
	],
};

/** A pending `awaitModalSubmit` call, kept around so a fake submission can be broadcast to it. */
interface Waiter {
	readonly filter: (submission: FakeSubmission) => boolean;
	readonly resolve: (submission: FakeSubmission) => void;
}

/**
 * Only the accessors `Modal.read` and `promptEditor*` touch, plus what makes a
 * submission routable: `customId`, the submitting user, and `isFromMessage`
 * (always `true` — every submission here is treated as coming from a message,
 * exactly as a card/embeds field modal does).
 */
type FakeSubmission = ReturnType<typeof fakeSubmission>;

function fakeSubmission(opts: {
	customId: string;
	userId: string;
	text?: Record<string, string>;
	ids?: Record<string, readonly string[]>;
}) {
	const text = opts.text ?? {};
	const ids = opts.ids ?? {};
	const collectionFor = (name: string) => {
		const picked = ids[name] ?? [];
		return picked.length === 0 ? null : new Collection(picked.map((id) => [id, { id }]));
	};
	return {
		customId: opts.customId,
		user: { id: opts.userId },
		isFromMessage: () => true,
		fields: {
			fields: new Map(
				[...Object.keys(text), ...Object.keys(ids)].map((name) => [name, {}] as const),
			),
			getTextInputValue: (name: string) => text[name] ?? "",
			getUploadedFiles: () => null,
			getStringSelectValues: () => [],
			getSelectedRoles: (name: string) => collectionFor(name),
			getSelectedUsers: (name: string) => collectionFor(name),
			getSelectedChannels: (name: string) => collectionFor(name),
		},
	};
}

/**
 * Stands in for a real Discord.js interaction across several concurrent
 * `awaitModalSubmit` calls the way the gateway does: every submission is
 * broadcast to *every* still-pending waiter, and each independently decides —
 * through its own `filter` — whether it is the one that should resolve. That
 * is what lets `emit` reproduce the crosstalk bug: a stale waiter left behind
 * by a dismissed modal is still in the broadcast list when a later,
 * unrelated submission arrives.
 */
function fakeMessageComponentInteraction(userId: string) {
	let waiters: Waiter[] = [];
	const showModal = vi.fn(async (_modal: ModalBuilder) => {});
	const awaitModalSubmit = (opts: {
		time: number;
		filter: (submission: FakeSubmission) => boolean;
	}) =>
		new Promise<FakeSubmission>((resolve) => {
			waiters.push({ filter: opts.filter, resolve });
		});
	return {
		user: { id: userId },
		showModal,
		awaitModalSubmit,
		/** Test-only: broadcasts a submission to every waiter still pending. */
		emit(submission: FakeSubmission) {
			const remaining: Waiter[] = [];
			for (const waiter of waiters) {
				if (waiter.filter(submission)) {
					waiter.resolve(submission);
				} else {
					remaining.push(waiter);
				}
			}
			waiters = remaining;
		},
	};
}

/** The customId a mocked `showModal` call actually carried. */
function shownCustomId(
	interaction: ReturnType<typeof fakeMessageComponentInteraction>,
	call: number,
): string {
	const modal = interaction.showModal.mock.calls[call]?.[0] as ModalBuilder;
	return (modal.toJSON() as { custom_id: string }).custom_id;
}

/** Lets pending microtasks (the `await interaction.showModal(...)` inside the prompt) settle. */
function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function settleOrTimeout<T>(promise: Promise<T>, ms = 20): Promise<T | "still-pending"> {
	return Promise.race([
		promise,
		new Promise<"still-pending">((r) => setTimeout(() => r("still-pending"), ms)),
	]);
}

describe("promptEditorFieldValue custom ids", () => {
	it("gives two openings of the same field two different custom ids", async () => {
		const interaction = fakeMessageComponentInteraction("user-1");

		void promptEditorFieldValue(
			interaction as unknown as MessageComponentInteraction,
			gameAddField,
			textFieldValue(null),
			translator,
			LOCALE,
		);
		await flush();
		void promptEditorFieldValue(
			interaction as unknown as MessageComponentInteraction,
			gameAddField,
			textFieldValue(null),
			translator,
			LOCALE,
		);
		await flush();

		const first = shownCustomId(interaction, 0);
		const second = shownCustomId(interaction, 1);
		expect(first).not.toBe(second);
	});
});

describe("promptEditorFieldValue crosstalk", () => {
	// This is the reproduction of the production bug: opening "Add a game" and
	// abandoning it, then declaring a request field named "Date", must not let
	// the abandoned wait answer as if it were the game.
	it("does not let a still-active wait for one field capture another field's submission", async () => {
		const interaction = fakeMessageComponentInteraction("user-1");

		const abandoned = promptEditorFieldValue(
			interaction as unknown as MessageComponentInteraction,
			gameAddField,
			textFieldValue(null),
			translator,
			LOCALE,
		);
		await flush();

		const submitted = promptEditorFieldValue(
			interaction as unknown as MessageComponentInteraction,
			requestDateField,
			textFieldValue(null),
			translator,
			LOCALE,
		);
		await flush();

		const requestDateCustomId = shownCustomId(interaction, 1);
		interaction.emit(
			fakeSubmission({
				customId: requestDateCustomId,
				userId: "user-1",
				text: { value: "Date" },
			}),
		);

		const result = await settleOrTimeout(submitted);
		expect(result).not.toBe("still-pending");
		expect((result as SettingsEditorSubmission).value).toBe("Date");

		// The abandoned "gameAdd" wait must still be sitting there, unresolved —
		// not settled with the "Date" submission that was never meant for it.
		expect(await settleOrTimeout(abandoned)).toBe("still-pending");
	});
});

describe("promptEditorFieldValue matching submission", () => {
	it("receives and reads the submission meant for it", async () => {
		const interaction = fakeMessageComponentInteraction("user-1");

		const prompt = promptEditorFieldValue(
			interaction as unknown as MessageComponentInteraction,
			gameAddField,
			textFieldValue(null),
			translator,
			LOCALE,
		);
		await flush();

		interaction.emit(
			fakeSubmission({
				customId: shownCustomId(interaction, 0),
				userId: "user-1",
				text: { value: "Chess Night" },
			}),
		);

		const result = await prompt;
		expect(result?.value).toBe("Chess Night");
		expect(result?.upload).toBeNull();
		expect(result?.ids).toBeNull();
	});

	it("ignores a submission from a different user even on the right custom id", async () => {
		const interaction = fakeMessageComponentInteraction("user-1");

		const prompt = promptEditorFieldValue(
			interaction as unknown as MessageComponentInteraction,
			gameAddField,
			textFieldValue(null),
			translator,
			LOCALE,
		);
		await flush();

		interaction.emit(
			fakeSubmission({
				customId: shownCustomId(interaction, 0),
				userId: "someone-else",
				text: { value: "Chess Night" },
			}),
		);

		expect(await settleOrTimeout(prompt)).toBe("still-pending");
	});
});

describe("promptEditorGroupValue matching submission", () => {
	it("receives and reads every member field from the submission meant for it", async () => {
		const interaction = fakeMessageComponentInteraction("user-1");

		const prompt = promptEditorGroupValue(
			interaction as unknown as MessageComponentInteraction,
			announcementGroup,
			() => textFieldValue(null),
			null,
			translator,
			LOCALE,
		);
		await flush();

		interaction.emit(
			fakeSubmission({
				customId: shownCustomId(interaction, 0),
				userId: "user-1",
				text: { title: "Season kickoff" },
				ids: { reviewerRole: ["role-9"] },
			}),
		);

		const result = await prompt;
		expect(result?.values.title).toEqual({ value: "Season kickoff", upload: null, ids: null });
		expect(result?.values.reviewerRole).toEqual({ value: null, upload: null, ids: ["role-9"] });
	});

	it("does not let a still-active wait for one group capture another opening's submission", async () => {
		const interaction = fakeMessageComponentInteraction("user-1");

		const abandoned = promptEditorGroupValue(
			interaction as unknown as MessageComponentInteraction,
			announcementGroup,
			() => textFieldValue(null),
			null,
			translator,
			LOCALE,
		);
		await flush();

		const submitted = promptEditorGroupValue(
			interaction as unknown as MessageComponentInteraction,
			announcementGroup,
			() => textFieldValue(null),
			null,
			translator,
			LOCALE,
		);
		await flush();

		interaction.emit(
			fakeSubmission({
				customId: shownCustomId(interaction, 1),
				userId: "user-1",
				text: { title: "Season kickoff" },
				ids: { reviewerRole: ["role-9"] },
			}),
		);

		expect(await settleOrTimeout(submitted)).not.toBe("still-pending");
		expect(await settleOrTimeout(abandoned)).toBe("still-pending");
	});
});
