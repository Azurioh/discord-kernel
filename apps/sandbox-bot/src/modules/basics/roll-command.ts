import { randomInt } from "node:crypto";
import { createCooldownGuard } from "@azurioh/discord-kernel/discord/command/cooldown-guard";
import { createCommand } from "@azurioh/discord-kernel/discord/command/create-command";
import { createIntegerOption } from "@azurioh/discord-kernel/discord/command/options";
import type { SlashCommand } from "@azurioh/discord-kernel/discord/command/types";
import { BASICS_CATALOG, BASICS_MESSAGES } from "@/modules/basics/basics-catalog";
import { localizedDescription } from "@/shared/discord/localized-description";

const DEFAULT_SIDES = 6;
const COOLDOWN_MS = 10_000;

/** `/roll`: a typed option behind a per-user cooldown guard. */
export function createRollCommand(guildIds: readonly string[]): SlashCommand {
	const sidesText = localizedDescription(BASICS_CATALOG, BASICS_MESSAGES.rollSidesDescription);
	return createCommand({
		name: "roll",
		...localizedDescription(BASICS_CATALOG, BASICS_MESSAGES.rollDescription),
		guildIds,
		guard: createCooldownGuard({ windowMs: COOLDOWN_MS }),
		ephemeral: false,
		options: {
			sides: createIntegerOption(sidesText.description, { min: 2, max: 100 }, sidesText),
		},
		handler: async (ctx) => {
			const sides = ctx.options.sides ?? DEFAULT_SIDES;
			await ctx.confirm(
				ctx.t(BASICS_MESSAGES.rollResult, { value: randomInt(1, sides + 1), sides }),
			);
		},
	});
}
