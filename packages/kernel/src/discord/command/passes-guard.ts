import {
	type CommandInteraction,
	type MessageComponentInteraction,
	MessageFlags,
	type ModalSubmitInteraction,
} from "discord.js";
import type { Guard } from "@/discord/command/guard";
import { type ReplyLocaleDeps, replyLocale } from "@/discord/interaction/reply-locale";
import type { Presenter } from "@/discord/presenter";

/**
 * Run a command's or a component's guard, if it has one. The guard gets the
 * reply dependencies, to word its denial in the reply language. On a denial,
 * answer with the guard's own message (ephemeral) and return `false`, so the
 * handler never runs.
 */
export async function passesGuard<
	I extends CommandInteraction | MessageComponentInteraction | ModalSubmitInteraction,
>(
	interaction: I,
	guard: Guard<I> | undefined,
	runtime: ReplyLocaleDeps & { readonly presenter: Presenter },
): Promise<boolean> {
	if (!guard) {
		return true;
	}
	const result = await guard.check(interaction, runtime);
	if (result.ok) {
		return true;
	}
	const locale = await replyLocale(interaction, runtime);
	await interaction.reply({
		embeds: [runtime.presenter.denial(runtime.translator.resolve(locale, result.message), locale)],
		flags: MessageFlags.Ephemeral,
	});
	return false;
}
