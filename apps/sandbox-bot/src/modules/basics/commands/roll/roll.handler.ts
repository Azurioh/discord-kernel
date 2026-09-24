import { randomInt } from "node:crypto";
import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import { DEFAULT_SIDES, type RollOptions } from "@/modules/basics/commands/roll/roll.options";
import { BASICS_MESSAGES } from "@/modules/basics/i18n/basics-messages";

/** `/roll`: roll the die and confirm with the result. */
export async function rollHandler(ctx: Context<RollOptions>): Promise<void> {
	const sides = ctx.options.sides ?? DEFAULT_SIDES;
	await ctx.confirm(ctx.t(BASICS_MESSAGES.rollResult, { value: randomInt(1, sides + 1), sides }));
}
