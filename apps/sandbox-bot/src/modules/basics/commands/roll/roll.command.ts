import { createCooldownGuard } from "@azurioh/discord-kernel/discord/command/cooldown-guard";
import { createCommand } from "@azurioh/discord-kernel/discord/command/create-command";
import type { SlashCommand } from "@azurioh/discord-kernel/discord/command/types";
import { rollHandler } from "@/modules/basics/commands/roll/roll.handler";
import { createRollOptions } from "@/modules/basics/commands/roll/roll.options";
import { BASICS_CATALOG } from "@/modules/basics/i18n/basics-catalog";
import { BASICS_MESSAGES } from "@/modules/basics/i18n/basics-messages";
import { localizedDescription } from "@/shared/discord/localized-description";

const COOLDOWN_MS = 10_000;

/** `/roll`: a typed option behind a per-user cooldown guard. */
export function createRollCommand(guildIds: readonly string[]): SlashCommand {
	return createCommand({
		name: "roll",
		...localizedDescription(BASICS_CATALOG, BASICS_MESSAGES.rollDescription),
		guildIds,
		guard: createCooldownGuard({ windowMs: COOLDOWN_MS }),
		ephemeral: false,
		options: createRollOptions(),
		handler: rollHandler,
	});
}
