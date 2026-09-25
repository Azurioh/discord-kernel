import { EmbedBuilder, MessageFlags, PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
	checkedByHandler,
	openToAnyone,
	requiresPermissions,
} from "@/discord/components/component-access";
import { ComponentRouter } from "@/discord/components/component-router";
import { CORE_MESSAGES } from "@/discord/i18n";
import type { Presenter } from "@/discord/presenter";
import type { Translator } from "@/i18n/translator";
import { SETTINGS_MESSAGES } from "@/settings/messages";
import { createFakeLogger } from "../../support/fake-logger";
import { createFakeModuleGate } from "../../support/fake-module-gate";

function makeDeps() {
	const presenter = {
		denial: vi.fn(() => new EmbedBuilder().setDescription("denied")),
	} as unknown as Presenter;
	const translator = {
		defaultLocale: "en",
		translate: vi.fn((_locale: string, key: string) => key),
	} as unknown as Translator;
	return { presenter, logger: createFakeLogger(), translator };
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
		const router = new ComponentRouter(makeDeps()).register({
			customId: "ban",
			authorize: requiresPermissions(PermissionFlagsBits.BanMembers),
			handle,
		});
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
		const router = new ComponentRouter(deps).register({
			customId: "ban",
			authorize: requiresPermissions(PermissionFlagsBits.BanMembers),
			handle,
		});
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
		const router = new ComponentRouter(makeDeps()).register({
			customId: "ban",
			authorize: requiresPermissions(PermissionFlagsBits.BanMembers),
			handle,
		});

		await router.handle(fakeButton("ban", null) as never);

		expect(handle).not.toHaveBeenCalled();
	});

	it("enforces every permission of a multi-permission declaration", async () => {
		const handle = vi.fn();
		const router = new ComponentRouter(makeDeps()).register({
			customId: "purge",
			authorize: requiresPermissions(
				PermissionFlagsBits.BanMembers,
				PermissionFlagsBits.ManageChannels,
			),
			handle,
		});

		await router.handle(fakeButton("purge", PermissionFlagsBits.BanMembers) as never);

		expect(handle).not.toHaveBeenCalled();
	});

	it.each([
		["anyone", openToAnyone("test double")],
		["handler", checkedByHandler("test double")],
	])("lets a %s declaration through to the handler", async (_kind, authorize) => {
		const handle = vi.fn();
		const router = new ComponentRouter(makeDeps()).register({
			customId: "open",
			authorize,
			handle,
		});

		await router.handle(fakeButton("open", null) as never);

		expect(handle).toHaveBeenCalledTimes(1);
	});

	it("applies the declaration to a customId carrying appended state", async () => {
		const handle = vi.fn();
		const router = new ComponentRouter(makeDeps()).register({
			customId: "feature:ban",
			authorize: requiresPermissions(PermissionFlagsBits.BanMembers),
			handle,
		});

		await router.handle(
			fakeButton("feature:ban:target-1", PermissionFlagsBits.SendMessages) as never,
		);

		expect(handle).not.toHaveBeenCalled();
	});

	it("ignores a customId no handler claims", async () => {
		const router = new ComponentRouter(makeDeps()).register({
			customId: "ban",
			authorize: openToAnyone("test double"),
			handle: vi.fn(),
		});

		expect(await router.handle(fakeButton("something-else", null) as never)).toBe(false);
	});
});

describe("ComponentRouter module gate (S15)", () => {
	const GUILD_A = "100000000000000001";
	const GUILD_B = "100000000000000002";

	function gatedDeps() {
		return { ...makeDeps(), gate: createFakeModuleGate({ [GUILD_A]: ["tickets"] }) };
	}

	function fakeGuildButton(customId: string, guildId: string | null) {
		return { ...fakeButton(customId, null), guildId, locale: "fr", guildLocale: "fr" };
	}

	it("does not run a handler of a module disabled on the guild, and says so", async () => {
		const deps = gatedDeps();
		const handle = vi.fn();
		const router = new ComponentRouter(deps).register(
			{ customId: "ticket", authorize: openToAnyone("test double"), handle },
			"tickets",
		);
		const interaction = fakeGuildButton("ticket:open", GUILD_A);

		const claimed = await router.handle(interaction as never);

		expect(claimed).toBe(true);
		expect(handle).not.toHaveBeenCalled();
		expect(deps.translator.translate).toHaveBeenCalledWith("fr", SETTINGS_MESSAGES.moduleDisabled);
		expect(deps.presenter.denial).toHaveBeenCalledWith(SETTINGS_MESSAGES.moduleDisabled, "fr");
		expect(interaction.reply).toHaveBeenCalledWith({
			embeds: [expect.any(EmbedBuilder)],
			flags: MessageFlags.Ephemeral,
		});
	});

	it("runs the handler on another guild, outside a guild, and without a module", async () => {
		const handle = vi.fn();
		const unassigned = vi.fn();
		const router = new ComponentRouter(gatedDeps())
			.registerAll(
				[{ customId: "ticket", authorize: openToAnyone("test double"), handle }],
				"tickets",
			)
			.register({ customId: "free", authorize: openToAnyone("test double"), handle: unassigned });

		await router.handle(fakeGuildButton("ticket", GUILD_B) as never);
		await router.handle(fakeGuildButton("ticket", null) as never);
		await router.handle(fakeGuildButton("free", GUILD_A) as never);

		expect(handle).toHaveBeenCalledTimes(2);
		expect(unassigned).toHaveBeenCalledTimes(1);
	});

	it("checks the gate before the handler's permissions", async () => {
		const deps = gatedDeps();
		const router = new ComponentRouter(deps).register(
			{
				customId: "ban",
				authorize: requiresPermissions(PermissionFlagsBits.BanMembers),
				handle: vi.fn(),
			},
			"tickets",
		);
		const interaction = fakeGuildButton("ban", GUILD_A);

		await router.handle(interaction as never);

		expect(interaction.reply).toHaveBeenCalledTimes(1);
		expect(deps.translator.translate).toHaveBeenCalledWith("fr", SETTINGS_MESSAGES.moduleDisabled);
		expect(deps.translator.translate).not.toHaveBeenCalledWith(
			"fr",
			CORE_MESSAGES.guardPermissionDenied,
			expect.anything(),
		);
	});
});
