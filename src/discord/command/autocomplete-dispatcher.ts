import type { Interaction } from "discord.js";
import type { SlashCommand } from "@/discord/command/types";
import type { InteractionDispatcher } from "@/discord/interaction/interaction-router";
import type { Logger } from "@/logger";

/**
 * The slice of the command registry this dispatcher needs. Depending on a
 * one-method port rather than on `CommandRouter` keeps the two dispatchers
 * decoupled while sharing a single registration — the alternative, a second map
 * of commands, would drift the moment a command is registered in only one.
 */
export interface CommandLookup {
	get(name: string): SlashCommand | undefined;
}

/**
 * Answers option autocomplete requests. It is an {@link InteractionDispatcher}
 * aggregated by the shared {@link InteractionRouter}, never a second
 * `client.on("interactionCreate")` — the whole app keeps exactly one listener.
 */
export class AutocompleteDispatcher implements InteractionDispatcher {
	constructor(
		private readonly commands: CommandLookup,
		private readonly logger: Logger,
	) {}

	/** Claim autocomplete interactions; ignore everything else. */
	async handle(interaction: Interaction): Promise<boolean> {
		if (!interaction.isAutocomplete()) {
			return false;
		}

		const command = this.commands.get(interaction.commandName);
		if (!command?.autocomplete) {
			return false;
		}

		// A failing suggestion must never surface to the user: Discord shows no
		// error for autocomplete, it just leaves the box spinning until it times
		// out. Swallow, log, and let the command reply with an empty list.
		try {
			await command.autocomplete(interaction);
		} catch (error) {
			this.logger.error(
				{
					command: interaction.commandName,
					err: error instanceof Error ? error.message : String(error),
				},
				"Autocomplete handler failed",
			);
		}
		return true;
	}
}
