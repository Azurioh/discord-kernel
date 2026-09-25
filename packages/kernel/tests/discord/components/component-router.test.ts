import { EmbedBuilder, PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
	checkedByHandler,
	openToAnyone,
	requiresPermissions,
} from "@/discord/components/component-access";
import { ComponentRouter } from "@/discord/components/component-router";
import { createComponentHandler } from "@/discord/components/create-component-handler";
import type { Presenter } from "@/discord/presenter";
import type { Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";

function makeLogger(): Logger {
	const logger = {
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
		child: () => logger,
	};
	return logger as unknown as Logger;
}

function makeDeps() {
	const presenter = {
		denial: vi.fn(() => new EmbedBuilder().setDescription("denied")),
	} as unknown as Presenter;
	const translator = {
		defaultLocale: "en",
		translate: vi.fn((_locale: string, key: string) => key),
	} as unknown as Translator;
	return { presenter, logger: makeLogger(), translator };
}

/** A button interaction double carrying a scriptable permission set. */
function fakeButton(customId: string, held: bigint | null) {
	return {
		customId,
		locale: "en",
		guildLocale: "en",
		memberPermissions: held === null ? null : new PermissionsBitField(held),
		isButton: () => true,
		isAnySelectMenu: () => false,
		isModalSubmit: () => false,
		reply: vi.fn(async () => undefined),
	};
}

describe("ComponentRouter authorization", () => {
	it("runs a handler whose declared permissions the member holds", async () => {
		const handle = vi.fn();
		const router = new ComponentRouter(makeDeps()).register(
			createComponentHandler({
				customId: "ban",
				authorize: requiresPermissions(PermissionFlagsBits.BanMembers),
				handle,
			}),
		);
		const interaction = fakeButton("ban", PermissionFlagsBits.BanMembers);

		await router.handle(interaction as never);

		expect(handle).toHaveBeenCalledTimes(1);
	});

	/**
	 * The point of the whole change: the barrier is the router's, so it cannot be
	 * lost to a handler that forgets to check.
	 */
	it("denies before the handler runs when a declared permission is missing", async () => {
		const handle = vi.fn();
		const deps = makeDeps();
		const router = new ComponentRouter(deps).register(
			createComponentHandler({
				customId: "ban",
				authorize: requiresPermissions(PermissionFlagsBits.BanMembers),
				handle,
			}),
		);
		const interaction = fakeButton("ban", PermissionFlagsBits.SendMessages);

		const claimed = await router.handle(interaction as never);

		expect(handle).not.toHaveBeenCalled();
		expect(interaction.reply).toHaveBeenCalledTimes(1);
		// Claimed all the same: the click was answered, not left to another dispatcher.
		expect(claimed).toBe(true);
	});

	/** An unknown permission set is never read as a granted one. */
	it("denies outside a guild, where no permission set can be resolved", async () => {
		const handle = vi.fn();
		const router = new ComponentRouter(makeDeps()).register(
			createComponentHandler({
				customId: "ban",
				authorize: requiresPermissions(PermissionFlagsBits.BanMembers),
				handle,
			}),
		);

		await router.handle(fakeButton("ban", null) as never);

		expect(handle).not.toHaveBeenCalled();
	});

	it("enforces every permission of a multi-permission declaration", async () => {
		const handle = vi.fn();
		const router = new ComponentRouter(makeDeps()).register(
			createComponentHandler({
				customId: "purge",
				authorize: requiresPermissions(
					PermissionFlagsBits.BanMembers,
					PermissionFlagsBits.ManageChannels,
				),
				handle,
			}),
		);

		await router.handle(fakeButton("purge", PermissionFlagsBits.BanMembers) as never);

		expect(handle).not.toHaveBeenCalled();
	});

	it.each([
		["anyone", openToAnyone("test double")],
		["handler", checkedByHandler("test double")],
	])("lets a %s declaration through to the handler", async (_kind, authorize) => {
		const handle = vi.fn();
		const router = new ComponentRouter(makeDeps()).register(
			createComponentHandler({ customId: "open", authorize, handle }),
		);

		await router.handle(fakeButton("open", null) as never);

		expect(handle).toHaveBeenCalledTimes(1);
	});

	it("applies the declaration to a customId carrying appended state", async () => {
		const handle = vi.fn();
		const router = new ComponentRouter(makeDeps()).register(
			createComponentHandler({
				customId: "feature:ban",
				authorize: requiresPermissions(PermissionFlagsBits.BanMembers),
				handle,
			}),
		);

		await router.handle(
			fakeButton("feature:ban:target-1", PermissionFlagsBits.SendMessages) as never,
		);

		expect(handle).not.toHaveBeenCalled();
	});

	it("ignores a customId no handler claims", async () => {
		const router = new ComponentRouter(makeDeps()).register(
			createComponentHandler({
				customId: "ban",
				authorize: openToAnyone("test double"),
				handle: vi.fn(),
			}),
		);

		expect(await router.handle(fakeButton("something-else", null) as never)).toBe(false);
	});
});
