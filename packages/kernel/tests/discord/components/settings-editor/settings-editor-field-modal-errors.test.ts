import {
	DiscordjsError,
	DiscordjsErrorCodes,
	type MessageComponentInteraction,
	type ModalBuilder,
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
	promptEditorFieldValue,
	promptEditorGroupValue,
} from "@/discord/components/settings-editor/settings-editor-field-modal";
import { textFieldValue } from "@/discord/components/settings-editor/settings-editor-field-values";
import type { SettingsEditorValueField } from "@/discord/components/settings-editor/settings-editor-fields";
import type { Translator } from "@/i18n/translator";
import { createFakeLogger } from "../../../support/fake-logger";

const field: SettingsEditorValueField<"title"> = {
	key: "title",
	labelKey: "title.label",
	hintKey: "title.hint",
	kind: "text",
	style: "short",
	maxLength: 100,
};
const translator = { translate: () => "Title" } as unknown as Translator;

function fakeInteraction() {
	return {
		user: { id: "member" },
		replied: false,
		deferred: false,
		showModal: vi.fn<(modal: ModalBuilder) => Promise<void>>().mockResolvedValue(undefined),
		awaitModalSubmit: vi.fn(),
	};
}

describe.each(["field", "group"] as const)("settings editor %s modal failures", (kind) => {
	it.each(["non-message", "show", "timeout", "collect"] as const)(
		"handles %s without changing the screen",
		async (failure) => {
			const fake = fakeInteraction();
			const logger = createFakeLogger();
			const error = new TypeError("Modal failed");
			const read = vi.fn(() => {
				throw error;
			});
			fake.awaitModalSubmit.mockResolvedValue({
				isFromMessage: () => failure !== "non-message",
				fields: {
					fields: new Map([
						["value", {}],
						["title", {}],
					]),
					getTextInputValue: read,
				},
			});
			if (failure === "show") {
				fake.showModal.mockRejectedValueOnce(error);
			}
			if (failure === "timeout") {
				fake.awaitModalSubmit.mockRejectedValueOnce(
					Reflect.construct(DiscordjsError, [
						DiscordjsErrorCodes.InteractionCollectorError,
						"time",
					]),
				);
			}
			if (failure === "collect") {
				fake.awaitModalSubmit.mockRejectedValueOnce(error);
			}
			const interaction = fake as unknown as MessageComponentInteraction;
			const result =
				kind === "field"
					? await promptEditorFieldValue(
							interaction,
							field,
							textFieldValue(null),
							translator,
							"en",
							logger,
						)
					: await promptEditorGroupValue(
							interaction,
							{
								key: "details",
								kind: "group",
								labelKey: "details.label",
								hintKey: "details.hint",
								fields: [field],
							},
							currentValue,
							null,
							translator,
							"en",
							logger,
						);
			expect(result).toBeNull();
			if (failure === "non-message" || failure === "timeout") {
				expect(read).not.toHaveBeenCalled();
				expect(logger.entries).toEqual([]);
			} else {
				expect(logger.error).toHaveBeenCalledExactlyOnceWith(
					kind === "field"
						? { err: error, fieldKey: "title" }
						: { err: error, groupKey: "details" },
					expect.any(String),
				);
			}
		},
	);

	it("propagates read failures without logging them", async () => {
		const fake = fakeInteraction();
		const logger = createFakeLogger();
		const error = new TypeError("Modal read failed");
		fake.awaitModalSubmit.mockResolvedValue({
			isFromMessage: () => true,
			fields: {
				fields: new Map([
					["value", {}],
					["title", {}],
				]),
				getTextInputValue: () => {
					throw error;
				},
			},
		});

		await expect(promptValue({ kind, fake, logger })).rejects.toBe(error);
		expect(logger.entries).toEqual([]);
	});

	it("includes the key in distinct ids for two openings", async () => {
		const fake = fakeInteraction();
		const logger = createFakeLogger();
		fake.awaitModalSubmit.mockResolvedValue({ isFromMessage: () => false });

		await promptValue({ kind, fake, logger });
		await promptValue({ kind, fake, logger });

		const ids = fake.showModal.mock.calls.map(([modal]) => modal.toJSON().custom_id);
		const prefix =
			kind === "field"
				? "settings-editor:field-value:title-"
				: "settings-editor:group-value:details-";
		expect(ids).toHaveLength(2);
		for (const id of ids) {
			expect(id.startsWith(prefix)).toBe(true);
		}
		expect(ids[0]).not.toBe(ids[1]);
	});
});

function promptValue(params: {
	kind: "field" | "group";
	fake: ReturnType<typeof fakeInteraction>;
	logger: ReturnType<typeof createFakeLogger>;
}) {
	const interaction = params.fake as unknown as MessageComponentInteraction;
	if (params.kind === "field") {
		return promptEditorFieldValue(
			interaction,
			field,
			textFieldValue(null),
			translator,
			"en",
			params.logger,
		);
	}
	return promptEditorGroupValue(
		interaction,
		{
			key: "details",
			kind: "group",
			labelKey: "details.label",
			hintKey: "details.hint",
			fields: [field],
		},
		currentValue,
		null,
		translator,
		"en",
		params.logger,
	);
}

function currentValue() {
	return textFieldValue(null);
}
