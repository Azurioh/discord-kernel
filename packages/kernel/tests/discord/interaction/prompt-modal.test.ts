import {
	type CommandInteraction,
	DiscordjsError,
	DiscordjsErrorCodes,
	type MessageComponentInteraction,
	type ModalBuilder,
	type ModalSubmitInteraction,
} from "discord.js";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createModal } from "@/discord/interaction/modal";
import { MODAL_PROMPT_TIMEOUT_MS, promptModal } from "@/discord/interaction/prompt-modal";
import { ModalPromptError } from "@/discord/interaction/prompt-modal-errors";

const modal = createModal({
	id: "report",
	title: "Report",
	fields: { reason: { label: "Reason" } },
});
const OVERRIDE_MS = 1200;

type Waiter = {
	filter: (submission: ModalSubmitInteraction) => boolean;
	resolve: (submission: ModalSubmitInteraction) => void;
	timer: ReturnType<typeof setTimeout>;
};

/** A collector boundary double: deliveries use the filter and deadlines reject like discord.js. */
function fakeInteraction() {
	const waiters = new Set<Waiter>();
	const showModal = vi.fn(async (_built: ModalBuilder) => {});
	const awaitModalSubmit = vi.fn(
		(options: { time: number; filter: (submission: ModalSubmitInteraction) => boolean }) =>
			new Promise<ModalSubmitInteraction>((resolve, reject) => {
				const timer = setTimeout(
					() =>
						reject(
							Reflect.construct(DiscordjsError, [
								DiscordjsErrorCodes.InteractionCollectorError,
								"time",
							]),
						),
					options.time,
				);
				waiters.add({ filter: options.filter, resolve, timer });
			}),
	);
	return {
		replied: false,
		deferred: false,
		user: { id: "member" },
		showModal,
		awaitModalSubmit,
		emit(submission: ModalSubmitInteraction) {
			for (const waiter of waiters) {
				if (waiter.filter(submission)) {
					clearTimeout(waiter.timer);
					waiters.delete(waiter);
					waiter.resolve(submission);
				}
			}
		},
	};
}

function submission(params: { customId: string; userId: string }): ModalSubmitInteraction {
	return {
		customId: params.customId,
		user: { id: params.userId },
		fields: { fields: new Map([["reason", {}]]), getTextInputValue: () => "Spam" },
	} as unknown as ModalSubmitInteraction;
}

function shownId(params: { fake: ReturnType<typeof fakeInteraction>; call: number }): string {
	const built = params.fake.showModal.mock.calls[params.call]?.[0];
	if (built === undefined) {
		throw new TypeError("Expected a shown modal");
	}
	return built.toJSON().custom_id;
}

describe("promptModal (T057)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns the submission and infers typed createModal values for a command", async () => {
		const fake = fakeInteraction();
		const pending = promptModal(fake as unknown as CommandInteraction, modal);
		await vi.advanceTimersByTimeAsync(0);
		const submitted = submission({ customId: shownId({ fake, call: 0 }), userId: "member" });
		fake.emit(submitted);
		const result = await pending;
		expect(result).toEqual({
			status: "submitted",
			interaction: submitted,
			values: { reason: "Spam" },
		});
		if (result.status === "submitted") {
			expectTypeOf(result.values).toEqualTypeOf<{ readonly reason: string }>();
		}
	});

	it("isolates concurrent component openings and rejects another member", async () => {
		const fake = fakeInteraction();
		const interaction = fake as unknown as MessageComponentInteraction;
		const first = promptModal(interaction, modal);
		const second = promptModal(interaction, modal);
		const firstDone = vi.fn();
		const secondDone = vi.fn();
		void first.then(firstDone);
		void second.then(secondDone);
		await vi.advanceTimersByTimeAsync(0);
		const firstId = shownId({ fake, call: 0 });
		const secondId = shownId({ fake, call: 1 });
		expect(firstId).not.toBe(secondId);
		fake.emit(submission({ customId: secondId, userId: "other" }));
		fake.emit(submission({ customId: "another-opening", userId: "member" }));
		await vi.advanceTimersByTimeAsync(0);
		expect(firstDone).not.toHaveBeenCalled();
		expect(secondDone).not.toHaveBeenCalled();
		const secondSubmission = submission({ customId: secondId, userId: "member" });
		fake.emit(secondSubmission);
		expect(await second).toMatchObject({ status: "submitted", interaction: secondSubmission });
		expect(firstDone).not.toHaveBeenCalled();
		const firstSubmission = submission({ customId: firstId, userId: "member" });
		fake.emit(firstSubmission);
		expect(await first).toMatchObject({ status: "submitted", interaction: firstSubmission });
	});

	it.each([undefined, OVERRIDE_MS])(
		"dismisses only at the configured deadline (%s)",
		async (timeoutMs) => {
			const fake = fakeInteraction();
			const settled = vi.fn();
			const pending = promptModal(fake as unknown as CommandInteraction, modal, { timeoutMs });
			void pending.then(settled);
			const deadline = timeoutMs ?? 300000;
			expect(MODAL_PROMPT_TIMEOUT_MS).toBe(300000);
			await vi.advanceTimersByTimeAsync(deadline - 1);
			expect(settled).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(await pending).toEqual({ status: "dismissed" });
		},
	);

	it.each(["replied", "deferred"] as const)(
		"rejects %s interactions before building or showing",
		async (state) => {
			const fake = fakeInteraction();
			fake[state] = true;
			const build = vi.spyOn(modal, "build");
			await expect(
				promptModal(fake as unknown as CommandInteraction, modal),
			).rejects.toBeInstanceOf(ModalPromptError);
			expect(fake.showModal).not.toHaveBeenCalled();
			expect(build).not.toHaveBeenCalled();
			build.mockRestore();
		},
	);

	it.each([
		Reflect.construct(DiscordjsError, [
			DiscordjsErrorCodes.InteractionCollectorError,
			"messageDelete",
		]),
		new TypeError("reason: time"),
	])("propagates non-timeout collector rejections (%s)", async (error) => {
		const fake = fakeInteraction();
		fake.awaitModalSubmit.mockRejectedValueOnce(error);
		await expect(promptModal(fake as unknown as CommandInteraction, modal)).rejects.toBe(error);
	});

	it("propagates showModal errors even when shaped like a timeout", async () => {
		const fake = fakeInteraction();
		const error = Reflect.construct(DiscordjsError, [
			DiscordjsErrorCodes.InteractionCollectorError,
			"time",
		]);
		fake.showModal.mockRejectedValueOnce(error);
		await expect(promptModal(fake as unknown as CommandInteraction, modal)).rejects.toBe(error);
		expect(fake.awaitModalSubmit).not.toHaveBeenCalled();
	});

	it("propagates build and read errors", async () => {
		const fake = fakeInteraction();
		const error = new TypeError("Invalid modal");
		await expect(
			promptModal(fake as unknown as CommandInteraction, {
				build: () => {
					throw error;
				},
				read: modal.read,
			}),
		).rejects.toBe(error);
		const pending = promptModal(fake as unknown as CommandInteraction, {
			build: modal.build,
			read: () => {
				throw error;
			},
		});
		const assertion = expect(pending).rejects.toBe(error);
		await vi.advanceTimersByTimeAsync(0);
		fake.emit(submission({ customId: shownId({ fake, call: 0 }), userId: "member" }));
		await assertion;
	});
});
