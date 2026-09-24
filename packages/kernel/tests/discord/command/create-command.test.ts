import { describe, expect, it } from "vitest";
import { createCommand, createSubCommand } from "@/discord/command/create-command";

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
