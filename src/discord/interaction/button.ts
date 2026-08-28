import { ActionRowBuilder, ButtonBuilder, type ButtonInteraction, ButtonStyle } from "discord.js";

export type ButtonStyleName = "primary" | "secondary" | "success" | "danger";

const BUTTON_STYLES: Record<ButtonStyleName, ButtonStyle> = {
	primary: ButtonStyle.Primary,
	secondary: ButtonStyle.Secondary,
	success: ButtonStyle.Success,
	danger: ButtonStyle.Danger,
};

/**
 * Interaction context handed to a button's `onClick`, mirroring the command
 * {@link import("@/discord/command/context").Context}: it exposes the
 * triggering interaction, the current state, and an `update` that re-renders the
 * message with the next state.
 */
export interface ComponentContext<S> {
	readonly interaction: ButtonInteraction;
	readonly state: S;
	update(next: S): Promise<void>;
}

export interface ButtonDef<S> {
	id: string;
	label?: string;
	emoji?: string;
	style?: ButtonStyleName;
	disabled?: (state: S) => boolean;
	onClick?: (ctx: ComponentContext<S>) => Promise<void> | void;
}

/**
 * Type-erased compiled button: knows how to render itself for a given state
 * (`apply`) and how to react to a click (`onClick`) — the component analogue of
 * a compiled subcommand. A button is *behaviour*, not a passive widget, which is
 * why it lives in the interaction layer rather than a UI/embed module.
 */
export interface Button<S> {
	readonly id: string;
	readonly onClick?: (ctx: ComponentContext<S>) => Promise<void> | void;
	apply(state: S, forceDisabled?: boolean): ButtonBuilder;
}

/** Declare a button: a definition bundling construction (`apply`) and behaviour (`onClick`). */
export function createButton<S>(def: ButtonDef<S>): Button<S> {
	const style = BUTTON_STYLES[def.style ?? "secondary"];
	return {
		id: def.id,
		onClick: def.onClick,
		apply(state, forceDisabled = false) {
			const builder = new ButtonBuilder().setCustomId(def.id).setStyle(style);
			if (def.label !== undefined) {
				builder.setLabel(def.label);
			}
			if (def.emoji !== undefined) {
				builder.setEmoji(def.emoji);
			}
			builder.setDisabled(forceDisabled || (def.disabled?.(state) ?? false));
			return builder;
		},
	};
}

/** Group buttons into a single action row, applying each against the current state. */
export function createActionRow<S>(
	buttons: Button<S>[],
	state: S,
	options: { disableAll?: boolean } = {},
): ActionRowBuilder<ButtonBuilder> {
	const disableAll = options.disableAll ?? false;
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		...buttons.map((entry) => entry.apply(state, disableAll)),
	);
}
