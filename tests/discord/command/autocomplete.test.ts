import type { AutocompleteInteraction, Interaction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { AutocompleteDispatcher } from "@/discord/command/autocomplete-dispatcher";
import { createCommand, createSubCommand } from "@/discord/command/create-command";
import { createStringOption } from "@/discord/command/options";
import type { SlashCommand } from "@/discord/command/types";
import type { Logger } from "@/logger";

function stubLogger(): Logger {
	const noop = vi.fn();
	const logger = {
		trace: noop,
		debug: noop,
		info: noop,
		warn: noop,
		error: vi.fn(),
		fatal: noop,
		child: () => logger,
	} as unknown as Logger;
	return logger;
}

interface FakeAutocompleteOptions {
	commandName?: string;
	focused?: { name: string; value: string };
	subcommand?: string | null;
	group?: string | null;
}

function fakeAutocomplete(options: FakeAutocompleteOptions = {}) {
	const respond = vi.fn(async (_choices: readonly { name: string; value: string | number }[]) => {
		return undefined;
	});
	return {
		respond,
		interaction: {
			commandName: options.commandName ?? "search",
			respond,
			isAutocomplete: () => true,
			isChatInputCommand: () => false,
			options: {
				getFocused: () => options.focused ?? { name: "query", value: "ab" },
				getSubcommand: () => options.subcommand ?? null,
				getSubcommandGroup: () => options.group ?? null,
			},
		} as unknown as AutocompleteInteraction,
	};
}

describe("createCommand autocomplete", () => {
	it("does not expose the seam when no option declares a resolver", () => {
		const command = createCommand({
			name: "search",
			description: "Search",
			options: { query: createStringOption("Query") },
			handler: async () => undefined,
		});

		expect(command.autocomplete).toBeUndefined();
	});

	it("answers with the resolver's suggestions", async () => {
		const command = createCommand({
			name: "search",
			description: "Search",
			options: {
				query: createStringOption("Query").withAutocomplete(() => [{ name: "Alpha", value: "a" }]),
			},
			handler: async () => undefined,
		});
		const { interaction, respond } = fakeAutocomplete();

		await command.autocomplete?.(interaction);

		expect(respond).toHaveBeenCalledWith([{ name: "Alpha", value: "a" }]);
	});

	// Discord rejects the whole response past 25 entries, so a generous resolver
	// must degrade to a partial list rather than break the input.
	it("truncates to Discord's 25-choice ceiling", async () => {
		const many = Array.from({ length: 40 }, (_, index) => ({
			name: `Choice ${index}`,
			value: String(index),
		}));
		const command = createCommand({
			name: "search",
			description: "Search",
			options: { query: createStringOption("Query").withAutocomplete(() => many) },
			handler: async () => undefined,
		});
		const { interaction, respond } = fakeAutocomplete();

		await command.autocomplete?.(interaction);

		expect(respond.mock.calls[0]?.[0]).toHaveLength(25);
	});

	it("answers an empty list when the focused option has no resolver", async () => {
		const command = createCommand({
			name: "search",
			description: "Search",
			options: {
				query: createStringOption("Query").withAutocomplete(() => []),
				other: createStringOption("Other"),
			},
			handler: async () => undefined,
		});
		const { interaction, respond } = fakeAutocomplete({ focused: { name: "other", value: "" } });

		await command.autocomplete?.(interaction);

		expect(respond).toHaveBeenCalledWith([]);
	});

	it("routes to the focused subcommand's options", async () => {
		const command = createCommand({
			name: "reminders",
			description: "Reminders",
			subcommands: {
				cancel: createSubCommand({
					description: "Cancel one",
					options: {
						id: createStringOption("Which").withAutocomplete(() => [{ name: "First", value: "1" }]),
					},
					handler: async () => undefined,
				}),
				add: createSubCommand({
					description: "Add one",
					options: { label: createStringOption("Label") },
					handler: async () => undefined,
				}),
			},
		});
		const { interaction, respond } = fakeAutocomplete({
			commandName: "reminders",
			subcommand: "cancel",
			focused: { name: "id", value: "" },
		});

		await command.autocomplete?.(interaction);

		expect(respond).toHaveBeenCalledWith([{ name: "First", value: "1" }]);
	});

	it("routes to a subcommand nested in a group", async () => {
		const command = createCommand({
			name: "config",
			description: "Configuration",
			groups: {
				hub: {
					description: "Hub settings",
					subcommands: {
						set: createSubCommand({
							description: "Set the hub",
							options: {
								channel: createStringOption("Which").withAutocomplete(() => [
									{ name: "Lobby", value: "lobby" },
								]),
							},
							handler: async () => undefined,
						}),
					},
				},
			},
		});
		const { interaction, respond } = fakeAutocomplete({
			commandName: "config",
			group: "hub",
			subcommand: "set",
			focused: { name: "channel", value: "" },
		});

		await command.autocomplete?.(interaction);

		expect(respond).toHaveBeenCalledWith([{ name: "Lobby", value: "lobby" }]);
	});

	// A failing resolver must still answer: Discord shows no error for a broken
	// autocomplete, it just leaves the picker spinning until it times out.
	it("answers an empty list when the resolver throws", async () => {
		const command = createCommand({
			name: "search",
			description: "Search",
			options: {
				query: createStringOption("Query").withAutocomplete(() => {
					throw new Error("db down");
				}),
			},
			handler: async () => undefined,
		});
		const { interaction, respond } = fakeAutocomplete();

		await expect(command.autocomplete?.(interaction)).rejects.toThrow("db down");
		expect(respond).toHaveBeenCalledWith([]);
	});
});

describe("AutocompleteDispatcher", () => {
	const dispatcherFor = (command: SlashCommand | undefined) =>
		new AutocompleteDispatcher({ get: () => command }, stubLogger());

	it("ignores interactions that are not autocomplete", async () => {
		const dispatcher = dispatcherFor(undefined);
		const interaction = { isAutocomplete: () => false } as unknown as Interaction;

		await expect(dispatcher.handle(interaction)).resolves.toBe(false);
	});

	it("declines when the command declares no resolver", async () => {
		const dispatcher = dispatcherFor({ data: { name: "search" } } as SlashCommand);
		const { interaction } = fakeAutocomplete();

		await expect(dispatcher.handle(interaction)).resolves.toBe(false);
	});

	// A throwing resolver must not escape: Discord shows no error for a failed
	// autocomplete, it just leaves the box spinning.
	it("claims the interaction and swallows a failing resolver", async () => {
		const logger = stubLogger();
		const command = {
			data: { name: "search" },
			autocomplete: async () => {
				throw new Error("boom");
			},
		} as unknown as SlashCommand;
		const dispatcher = new AutocompleteDispatcher({ get: () => command }, logger);
		const { interaction } = fakeAutocomplete();

		await expect(dispatcher.handle(interaction)).resolves.toBe(true);
		expect(logger.error).toHaveBeenCalled();
	});
});
