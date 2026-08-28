import { ApplicationCommandType, PermissionFlagsBits } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { createContextMenuCommand } from "@/discord/command/create-context-menu-command";
import type { CommandRuntime } from "@/discord/command/types";
import type { Presenter } from "@/discord/presenter";
import { ValidationError } from "@/errors";
import type { Translator } from "@/i18n";
import type { Logger } from "@/logger";

/** Embeds are opaque here: the tests assert which presenter path was taken. */
function stubRuntime(): CommandRuntime & { presenter: Record<string, ReturnType<typeof vi.fn>> } {
	const presenter = {
		confirmation: vi.fn(() => ({ kind: "confirmation" })),
		error: vi.fn(() => ({ kind: "error" })),
		warning: vi.fn(() => ({ kind: "warning" })),
		denial: vi.fn(() => ({ kind: "denial" })),
		systemError: vi.fn(() => ({ kind: "systemError" })),
	};
	const logger = {
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
		child: vi.fn(),
	};
	return {
		presenter: presenter as unknown as Presenter & Record<string, ReturnType<typeof vi.fn>>,
		logger: logger as unknown as Logger,
		translator: {
			defaultLocale: "en",
			translate: (_locale, key) => key,
			resolve: (_locale, text) => (typeof text === "string" ? text : text.key),
		} satisfies Translator as Translator,
	} as CommandRuntime & { presenter: Record<string, ReturnType<typeof vi.fn>> };
}

function fakeUserInteraction(targetUser: { id: string } = { id: "target-1" }) {
	return {
		commandName: "Inspect",
		id: "interaction-1",
		user: { id: "caller-1" },
		targetUser,
		deferred: false,
		replied: false,
		reply: vi.fn(async () => undefined),
		editReply: vi.fn(async () => undefined),
		followUp: vi.fn(async () => undefined),
		deferReply: vi.fn(async () => undefined),
		isUserContextMenuCommand: () => true,
		isMessageContextMenuCommand: () => false,
		inGuild: () => true,
		inCachedGuild: () => true,
		memberPermissions: null,
	};
}

describe("createContextMenuCommand", () => {
	it("builds a user-targeted application command", () => {
		const command = createContextMenuCommand({
			name: "Inspect",
			target: "user",
			handler: async () => undefined,
		});

		const json = command.data.toJSON?.() as { name: string; type: number };
		expect(json.name).toBe("Inspect");
		expect(json.type).toBe(ApplicationCommandType.User);
	});

	it("builds a message-targeted application command", () => {
		const command = createContextMenuCommand({
			name: "Archive",
			target: "message",
			handler: async () => undefined,
		});

		const json = command.data.toJSON?.() as { type: number };
		expect(json.type).toBe(ApplicationCommandType.Message);
	});

	it("carries the resolved default member permissions", () => {
		const command = createContextMenuCommand({
			name: "Moderate",
			target: "user",
			defaultMemberPermissions: [PermissionFlagsBits.ModerateMembers],
			handler: async () => undefined,
		});

		const json = command.data.toJSON?.() as { default_member_permissions: string };
		expect(json.default_member_permissions).toBe(String(PermissionFlagsBits.ModerateMembers));
	});

	it("hands the clicked user to the handler", async () => {
		const handler = vi.fn(async () => undefined);
		const command = createContextMenuCommand({ name: "Inspect", target: "user", handler });
		const interaction = fakeUserInteraction({ id: "target-42" });

		await command.dispatch(interaction as never, stubRuntime());

		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({ target: expect.objectContaining({ id: "target-42" }) }),
		);
	});

	it("denies through the presenter when a guard fails", async () => {
		const handler = vi.fn(async () => undefined);
		const runtime = stubRuntime();
		const command = createContextMenuCommand({
			name: "Inspect",
			target: "user",
			guard: { check: () => ({ ok: false, message: "Denied." }) },
			handler,
		});
		const interaction = fakeUserInteraction();

		await command.dispatch(interaction as never, runtime);

		expect(handler).not.toHaveBeenCalled();
		expect(runtime.presenter.denial).toHaveBeenCalledWith("Denied.", "en");
	});

	// A business error is user feedback, not an incident: no reference is minted.
	it("renders a business error as a warning", async () => {
		const runtime = stubRuntime();
		const command = createContextMenuCommand({
			name: "Inspect",
			target: "user",
			handler: async () => {
				throw new ValidationError("Bad input.");
			},
		});

		await command.dispatch(fakeUserInteraction() as never, runtime);

		expect(runtime.presenter.warning).toHaveBeenCalledWith("Bad input.", "en");
		expect(runtime.presenter.systemError).not.toHaveBeenCalled();
	});

	it("renders an unexpected error as an incident", async () => {
		const runtime = stubRuntime();
		const command = createContextMenuCommand({
			name: "Inspect",
			target: "user",
			handler: async () => {
				throw new Error("boom");
			},
		});

		await command.dispatch(fakeUserInteraction() as never, runtime);

		expect(runtime.presenter.systemError).toHaveBeenCalled();
		expect(runtime.logger.error).toHaveBeenCalled();
	});
});
