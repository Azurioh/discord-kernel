import type { Interaction } from "discord.js";
import type { BotState } from "@/bot/create-bot";
import { sendEmbed } from "@/discord/command/send-embed";
import { CORE_MESSAGES } from "@/discord/i18n";
import type { InteractionDispatcher } from "@/discord/interaction/interaction-router";
import { type ReplyLocaleDeps, replyLocale } from "@/discord/interaction/reply-locale";
import type { Presenter } from "@/discord/presenter";

/** Prevent interactions from reaching module handlers outside the running state. */
export class LifecycleDispatcher implements InteractionDispatcher {
	/**
	 * @param deps - Current lifecycle state and localized reply services.
	 */
	constructor(
		private readonly deps: ReplyLocaleDeps & {
			readonly state: () => BotState;
			readonly presenter: Presenter;
		},
	) {}

	/** Answer interactions while the bot is starting or stopping.
	 * @param interaction - Incoming gateway interaction.
	 * @returns Whether the lifecycle dispatcher consumed the interaction.
	 * @throws When an autocomplete acknowledgement fails.
	 */
	async handle(interaction: Interaction): Promise<boolean> {
		if (this.deps.state() === "running") {
			return false;
		}
		if (interaction.isAutocomplete()) {
			await interaction.respond([]);
			return true;
		}
		if (
			interaction.isChatInputCommand() ||
			interaction.isContextMenuCommand() ||
			interaction.isButton() ||
			interaction.isAnySelectMenu() ||
			interaction.isModalSubmit()
		) {
			const locale = await replyLocale(interaction, this.deps);
			const message = this.deps.translator.translate(locale, CORE_MESSAGES.botRestarting);
			await sendEmbed(
				interaction,
				this.deps.presenter.denial(message, locale),
				true,
				this.deps.logger,
			);
			return true;
		}
		return false;
	}
}
