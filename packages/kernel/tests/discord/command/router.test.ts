import { EmbedBuilder, MessageFlags } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { CommandRouter } from "@/discord/command/router";
import type { ContextMenuCommand, SlashCommand } from "@/discord/command/types";
import type { Presenter } from "@/discord/presenter";
import type { Translator } from "@/i18n/translator";
import { SETTINGS_MESSAGES } from "@/settings/messages";
import { createFakeLocaleResolver } from "../../support/fake-locale-resolver";
import { createFakeLogger } from "../../support/fake-logger";
import { createFakeModuleGate } from "../../support/fake-module-gate";

const GUILD_A = "100000000000000001";
const GUILD_B = "100000000000000002";
const DISABLED_EMBED = new EmbedBuilder().setDescription("disabled");

function makeDeps() {
	const presenter = { denial: vi.fn(() => DISABLED_EMBED) } as unknown as Presenter;
	const translator = {
		defaultLocale: "en",
		translate: vi.fn((_locale: string, key: string) => key),
	} as unknown as Translator;
	return {
		presenter,
		translator,
		logger: createFakeLogger(),
		gate: createFakeModuleGate({ [GUILD_A]: ["tickets"] }),
	};
}

function slashCommand(name: string) {
	return { data: { name }, dispatch: vi.fn(async () => undefined) } satisfies SlashCommand;
}

function contextMenuCommand(name: string) {
	return { data: { name }, dispatch: vi.fn(async () => undefined) } satisfies ContextMenuCommand;
}

/** A command interaction double, slash or context menu, in a guild or in DMs. */
function fakeCommandInteraction(params: {
	name: string;
	guildId: string | null;
	kind?: "slash" | "contextMenu";
}) {
	const kind = params.kind ?? "slash";
	return {
		id: "900000000000000001",
		commandName: params.name,
		guildId: params.guildId,
		locale: "fr",
		guildLocale: "fr",
		deferred: false,
		replied: false,
		isChatInputCommand: () => kind === "slash",
		isContextMenuCommand: () => kind === "contextMenu",
		reply: vi.fn(async () => undefined),
	};
}

describe("CommandRouter module gate (S15)", () => {
	it("does not run a command of a module disabled on the guild, and says so", async () => {
		const deps = makeDeps();
		const command = slashCommand("ticket");
		const router = new CommandRouter(deps).register(command, "tickets");
		const interaction = fakeCommandInteraction({ name: "ticket", guildId: GUILD_A });

		const claimed = await router.handle(interaction as never);

		expect(claimed).toBe(true);
		expect(command.dispatch).not.toHaveBeenCalled();
		expect(deps.translator.translate).toHaveBeenCalledWith("fr", SETTINGS_MESSAGES.moduleDisabled);
		expect(deps.presenter.denial).toHaveBeenCalledWith(SETTINGS_MESSAGES.moduleDisabled, "fr");
		expect(interaction.reply).toHaveBeenCalledWith({
			embeds: [DISABLED_EMBED],
			flags: MessageFlags.Ephemeral,
		});
	});

	it("runs the same command on another guild", async () => {
		const command = slashCommand("ticket");
		const router = new CommandRouter(makeDeps()).registerAll([command], "tickets");

		await router.handle(fakeCommandInteraction({ name: "ticket", guildId: GUILD_B }) as never);

		expect(command.dispatch).toHaveBeenCalledTimes(1);
	});

	it("runs a command outside a guild", async () => {
		const command = slashCommand("ticket");
		const router = new CommandRouter(makeDeps()).register(command, "tickets");

		await router.handle(fakeCommandInteraction({ name: "ticket", guildId: null }) as never);

		expect(command.dispatch).toHaveBeenCalledTimes(1);
	});

	it("runs a command of another module on the guild", async () => {
		const command = slashCommand("level");
		const router = new CommandRouter(makeDeps()).register(command, "levels");

		await router.handle(fakeCommandInteraction({ name: "level", guildId: GUILD_A }) as never);

		expect(command.dispatch).toHaveBeenCalledTimes(1);
	});

	it("runs a command registered without a module", async () => {
		const command = slashCommand("ticket");
		const router = new CommandRouter(makeDeps()).register(command);

		await router.handle(fakeCommandInteraction({ name: "ticket", guildId: GUILD_A }) as never);

		expect(command.dispatch).toHaveBeenCalledTimes(1);
	});

	it("runs every command when no gate is given", async () => {
		const { gate: _gate, ...deps } = makeDeps();
		const command = slashCommand("ticket");
		const router = new CommandRouter(deps).register(command, "tickets");

		await router.handle(fakeCommandInteraction({ name: "ticket", guildId: GUILD_A }) as never);

		expect(command.dispatch).toHaveBeenCalledTimes(1);
	});

	it("gates context-menu entries the same way", async () => {
		const command = contextMenuCommand("Open ticket");
		const router = new CommandRouter(makeDeps()).registerAllContextMenus([command], "tickets");
		const blocked = fakeCommandInteraction({
			name: "Open ticket",
			guildId: GUILD_A,
			kind: "contextMenu",
		});

		await router.handle(blocked as never);
		await router.handle(
			fakeCommandInteraction({
				name: "Open ticket",
				guildId: GUILD_B,
				kind: "contextMenu",
			}) as never,
		);

		expect(blocked.reply).toHaveBeenCalledTimes(1);
		expect(command.dispatch).toHaveBeenCalledTimes(1);
	});

	it("gates a single context-menu registration with its module", async () => {
		const command = contextMenuCommand("Open ticket");
		const router = new CommandRouter(makeDeps()).registerContextMenu(command, "tickets");

		await router.handle(
			fakeCommandInteraction({
				name: "Open ticket",
				guildId: GUILD_A,
				kind: "contextMenu",
			}) as never,
		);

		expect(command.dispatch).not.toHaveBeenCalled();
	});
});

describe("CommandRouter reply language (S17)", () => {
	it("says a module is disabled in the locale of the bot's resolver", async () => {
		const deps = { ...makeDeps(), localeResolver: createFakeLocaleResolver("en") };
		const router = new CommandRouter(deps).register(slashCommand("ticket"), "tickets");

		await router.handle(fakeCommandInteraction({ name: "ticket", guildId: GUILD_A }) as never);

		expect(deps.presenter.denial).toHaveBeenCalledWith(SETTINGS_MESSAGES.moduleDisabled, "en");
	});

	it("hands the resolver to the commands through the runtime", async () => {
		const localeResolver = createFakeLocaleResolver("fr");
		const command = slashCommand("ticket");
		const router = new CommandRouter({ ...makeDeps(), localeResolver }).register(command);

		await router.handle(fakeCommandInteraction({ name: "ticket", guildId: GUILD_B }) as never);

		expect(command.dispatch).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ localeResolver }),
		);
	});
});
