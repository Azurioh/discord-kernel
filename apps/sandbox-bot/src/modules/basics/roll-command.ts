import { randomInt } from "node:crypto";
import { createCooldownGuard } from "@azurioh/discord-kernel/discord/command/cooldown-guard";
import { createCommand } from "@azurioh/discord-kernel/discord/command/create-command";
import { frenchLocalization } from "@azurioh/discord-kernel/discord/command/localization";
import { createIntegerOption } from "@azurioh/discord-kernel/discord/command/options";
import type { SlashCommand } from "@azurioh/discord-kernel/discord/command/types";
import { BASICS_MESSAGES } from "@/modules/basics/basics-catalog";

const DEFAULT_SIDES = 6;
const COOLDOWN_MS = 10_000;

/** `/roll`: a typed option behind a per-user cooldown guard. */
export function createRollCommand(guildIds: readonly string[]): SlashCommand {
	return createCommand({
		name: "roll",
		description: "Roll a die (10 s cooldown per user)",
		descriptionLocalizations: frenchLocalization("Lancer un dé (10 s d'attente par membre)"),
		guildIds,
		guard: createCooldownGuard({ windowMs: COOLDOWN_MS }),
		ephemeral: false,
		options: {
			sides: createIntegerOption(
				"Number of sides (default 6)",
				{ min: 2, max: 100 },
				{ descriptionLocalizations: frenchLocalization("Nombre de faces (6 par défaut)") },
			),
		},
		handler: async (ctx) => {
			const sides = ctx.options.sides ?? DEFAULT_SIDES;
			await ctx.confirm(
				ctx.t(BASICS_MESSAGES.rollResult, { value: randomInt(1, sides + 1), sides }),
			);
		},
	});
}
