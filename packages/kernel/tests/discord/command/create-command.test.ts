import { EmbedBuilder } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { createCommand, createSubCommand } from "@/discord/command/create-command";
import type { CommandRuntime } from "@/discord/command/types";
import { CORE_MESSAGES } from "@/discord/i18n";
import type { LocaleResolver } from "@/discord/interaction/locale-resolver";
import type { Presenter } from "@/discord/presenter";
import { ValidationError } from "@/errors/business-error";
import type { Translator } from "@/i18n/translator";
import { createFakeLocaleResolver } from "../../support/fake-locale-resolver";
import { createFakeLogger } from "../../support/fake-logger";

/**
 * A subcommand group's `nameLocalizations`/`descriptionLocalizations` used to
 * be silently dropped: `addSubcommandGroup` only called `setName`/
 * `setDescription`, unlike the root command and every plain subcommand. This
 * guards the group localization path specifically, since nothing else in the
 * suite would have caught the regression.
 */
describe("createCommand group localizations", () => {
	it("applies a group's nameLocalizations and descriptionLocalizations", () => {
		const command = createCommand({
			name: "comms",
			description: "Manage communication events",
			groups: {
				recap: {
					nameLocalizations: { fr: "récapitulatif" },
					description: "Manage the weekly recap",
					descriptionLocalizations: { fr: "Gérer le récapitulatif hebdomadaire" },
					subcommands: {
						run: createSubCommand({
							description: "Run the recap",
							handler: async () => undefined,
						}),
					},
				},
			},
		});

		const json = command.data.toJSON?.() as {
			options: {
				name: string;
				name_localizations?: Record<string, string> | null;
				description_localizations?: Record<string, string> | null;
			}[];
		};
		const group = json.options.find((option) => option.name === "recap");

		expect(group?.name_localizations?.fr).toBe("récapitulatif");
		expect(group?.description_localizations?.fr).toBe("Gérer le récapitulatif hebdomadaire");
	});

	it("leaves the group's localizations undefined when none are declared", () => {
		const command = createCommand({
			name: "comms",
			description: "Manage communication events",
			groups: {
				recap: {
					description: "Manage the weekly recap",
					subcommands: {
						run: createSubCommand({
							description: "Run the recap",
							handler: async () => undefined,
						}),
					},
				},
			},
		});

		const json = command.data.toJSON?.() as {
			options: { name: string; name_localizations?: Record<string, string> | null }[];
		};
		const group = json.options.find((option) => option.name === "recap");

		expect(group?.name_localizations).toBeUndefined();
	});
});

/** A chat-input interaction double for a flat command, answered in `de` by the member. */
function fakeSlashInteraction() {
	return {
		commandName: "ping",
		id: "900000000000000001",
		guildId: "100000000000000001",
		locale: "de",
		guildLocale: "en-US",
		user: { id: "400000000000000001" },
		deferred: false,
		replied: false,
		options: { getSubcommandGroup: () => null, getSubcommand: () => "missing" },
		reply: vi.fn(async () => undefined),
		editReply: vi.fn(async () => undefined),
		followUp: vi.fn(async () => undefined),
		deferReply: vi.fn(async () => undefined),
	};
}

function runtimeWith(localeResolver?: LocaleResolver): CommandRuntime & {
	presenter: Record<string, ReturnType<typeof vi.fn>>;
} {
	const presenter = {
		confirmation: vi.fn(() => new EmbedBuilder()),
		error: vi.fn(() => new EmbedBuilder()),
		warning: vi.fn(() => new EmbedBuilder()),
		denial: vi.fn(() => new EmbedBuilder()),
		systemError: vi.fn(() => new EmbedBuilder()),
	};
	return {
		presenter: presenter as unknown as Presenter & Record<string, ReturnType<typeof vi.fn>>,
		logger: createFakeLogger(),
		translator: {
			defaultLocale: "en",
			translate: (_locale, key) => key,
			resolve: (_locale, text) => (typeof text === "string" ? text : text.key),
		} satisfies Translator as Translator,
		localeResolver,
	} as CommandRuntime & { presenter: Record<string, ReturnType<typeof vi.fn>> };
}

describe("createCommand reply language (S17)", () => {
	it("gives the handler the locale of the bot's resolver", async () => {
		const handler = vi.fn(async () => undefined);
		const command = createCommand({ name: "ping", description: "Ping", handler });
		const localeResolver = createFakeLocaleResolver("fr");
		const interaction = fakeSlashInteraction();

		await command.dispatch(interaction as never, runtimeWith(localeResolver));

		expect(localeResolver.resolve).toHaveBeenCalledWith(interaction);
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ locale: "fr" }));
	});

	it("keeps the interaction's own locales without a resolver", async () => {
		const handler = vi.fn(async () => undefined);
		const command = createCommand({ name: "ping", description: "Ping", handler });

		await command.dispatch(fakeSlashInteraction() as never, runtimeWith());

		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }));
	});

	it("denies a guard in the resolver's locale", async () => {
		const runtime = runtimeWith(createFakeLocaleResolver("fr"));
		const command = createCommand({
			name: "ping",
			description: "Ping",
			guard: { check: () => ({ ok: false, message: "Denied." }) },
			handler: async () => undefined,
		});

		await command.dispatch(fakeSlashInteraction() as never, runtime);

		expect(runtime.presenter.denial).toHaveBeenCalledWith("Denied.", "fr");
	});

	it("renders a failed handler in the resolver's locale", async () => {
		const runtime = runtimeWith(createFakeLocaleResolver("fr"));
		const command = createCommand({
			name: "ping",
			description: "Ping",
			handler: async () => {
				throw new ValidationError("Bad input.");
			},
		});

		await command.dispatch(fakeSlashInteraction() as never, runtime);

		expect(runtime.presenter.warning).toHaveBeenCalledWith("Bad input.", "fr");
	});

	it("answers an unknown subcommand in the resolver's locale", async () => {
		const runtime = runtimeWith(createFakeLocaleResolver("fr"));
		const command = createCommand({
			name: "ping",
			description: "Ping",
			subcommands: {
				known: createSubCommand({ description: "Known", handler: async () => undefined }),
			},
		});

		await command.dispatch(fakeSlashInteraction() as never, runtime);

		expect(runtime.presenter.error).toHaveBeenCalledWith(CORE_MESSAGES.unknownSubcommand, "fr");
	});
});
