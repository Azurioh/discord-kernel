import type { AutocompleteInteraction } from "discord.js";
import type { CompiledSubcommand } from "@/discord/command/create-command";
import type { Options } from "@/discord/command/options";
import { routeKey } from "@/discord/command/route-key";
import type { Choice } from "@/settings/choice";

/**
 * Serving option autocomplete. Kept beside the DSL because resolving *which*
 * option is focused needs the same route table `createCommand` builds — the
 * dispatcher only decides that an interaction is an autocomplete request.
 */

/** Discord refuses more than this many suggestions in one response. */
const MAX_CHOICES = 25;

/**
 * Answer a focused option's autocomplete request.
 *
 * Nothing here is allowed to throw: Discord surfaces no error for a failed
 * autocomplete, it just leaves the input spinning until it times out, so an
 * empty list is the only sane failure mode. The caller logs; the user keeps
 * typing.
 */
export async function respondWithSuggestions(
	interaction: AutocompleteInteraction,
	options: Options,
): Promise<void> {
	const focused = interaction.options.getFocused(true);
	const option = options[focused.name];
	const resolver = option?.autocomplete;

	if (!resolver) {
		await interaction.respond([]);
		return;
	}

	// The resolver is the only part that can fail (it usually hits a database).
	// Answering an empty list keeps the picker responsive; rethrowing after the
	// response lets the dispatcher log the cause without leaving the user hanging.
	let choices: readonly Choice[];
	try {
		choices = await resolver(interaction);
	} catch (error) {
		await interaction.respond([]);
		throw error;
	}

	await interaction.respond(truncate(choices));
}

/**
 * Discord rejects the whole response when it carries more than 25 choices, so a
 * resolver returning more is trimmed rather than failing outright — a partial
 * list is still useful to the user typing.
 */
function truncate(choices: readonly Choice[]): Choice[] {
	return choices.slice(0, MAX_CHOICES);
}

/**
 * The options a given autocomplete interaction applies to: the focused option
 * belongs to the invoked subcommand, not to the command as a whole.
 */
export function resolveRouteOptions(
	interaction: AutocompleteInteraction,
	routes: Map<string, CompiledSubcommand>,
	flatOptions: Options | null,
): Options {
	if (flatOptions) {
		return flatOptions;
	}
	const group = interaction.options.getSubcommandGroup(false);
	const name = interaction.options.getSubcommand(false);
	if (name === null) {
		return {};
	}
	return routes.get(routeKey(group, name))?.options ?? {};
}
