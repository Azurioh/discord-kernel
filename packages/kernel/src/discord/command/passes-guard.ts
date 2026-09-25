import { type CommandInteraction, MessageFlags } from "discord.js";
import type { Guard } from "@/discord/command/guard";
import type { CommandRuntime } from "@/discord/command/types";
import { interactionLocale } from "@/discord/interaction/interaction-locale";

/**
 * Run a command's guard, if it has one. On a denial, answer with the guard's
 * own message (ephemeral) and return `false`, so the handler never runs.
 */
export async function passesGuard(
	interaction: CommandInteraction,
	guard: Guard | undefined,
	runtime: CommandRuntime,
): Promise<boolean> {
	if (!guard) {
		return true;
	}
	const result = await guard.check(interaction);
	if (result.ok) {
		return true;
	}
	const locale = interactionLocale(interaction, runtime.translator);
	await interaction.reply({
		embeds: [runtime.presenter.denial(runtime.translator.resolve(locale, result.message), locale)],
		flags: MessageFlags.Ephemeral,
	});
	return false;
}
