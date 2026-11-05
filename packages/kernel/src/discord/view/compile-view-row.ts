import { ActionRowBuilder, type MessageActionRowComponentBuilder } from "discord.js";
import { createActionRow } from "@/discord/interaction/button";
import type { AnySelectMenuBuilder } from "@/discord/interaction/select-menu";
import type { ViewRow } from "@/discord/view/view";

/** What every control renders against. */
export interface CompileContext<S> {
	readonly state: S;
	/** Render every button and select disabled, whatever its own rule says. */
	readonly disabled: boolean;
}

/**
 * Compile a row node to its action row, in either layout.
 *
 * @param row - The `buttons` or `select` node.
 * @param context - The state buttons render against, and whether every control is disabled.
 * @returns The action row discord.js sends.
 */
export function compileViewRow<S>(
	row: ViewRow<S>,
	context: CompileContext<S>,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
	if (row.type === "buttons") {
		return createActionRow([...row.buttons], context.state, { disableAll: context.disabled });
	}
	return new ActionRowBuilder<AnySelectMenuBuilder>().addComponents(
		row.menu.apply(context.disabled),
	);
}
