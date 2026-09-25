import {
	ActionRowBuilder,
	type AnySelectMenuInteraction,
	ChannelSelectMenuBuilder,
	type ChannelSelectMenuInteraction,
	type ChannelType,
	RoleSelectMenuBuilder,
	type RoleSelectMenuInteraction,
	StringSelectMenuBuilder,
	type StringSelectMenuInteraction,
	UserSelectMenuBuilder,
	type UserSelectMenuInteraction,
} from "discord.js";
import type {
	ComponentAuthorization,
	ComponentHandler,
} from "@/discord/components/component-router";
import { applySelectBounds } from "@/discord/interaction/select-bounds";

/** The builders this DSL can produce; the union an action row accepts. */
export type AnySelectMenuBuilder =
	| StringSelectMenuBuilder
	| ChannelSelectMenuBuilder
	| RoleSelectMenuBuilder
	| UserSelectMenuBuilder;

/**
 * Context handed to `onSelect`, mirroring
 * {@link import("@/discord/interaction/button").ComponentContext}: the
 * triggering interaction plus the picked values, already unwrapped so a handler
 * does not have to know where discord.js keeps them.
 */
export interface SelectContext<I extends AnySelectMenuInteraction> {
	readonly interaction: I;
	readonly values: readonly string[];
}

/**
 * Presentation options shared by every select flavour. Split from the handler so
 * the shared `applyBaseOptions` never sees `onSelect`: a callback is
 * contravariant in its interaction type, so a common supertype for the
 * *definitions* cannot exist.
 */
export interface SelectLayout {
	id: string;
	placeholder?: string;
	minValues?: number;
	maxValues?: number;
	disabled?: boolean;
}

/** A select declaration: its layout plus the behaviour it carries. */
export interface BaseSelectDef<I extends AnySelectMenuInteraction> extends SelectLayout {
	onSelect?: (ctx: SelectContext<I>) => Promise<void> | void;
}

/**
 * Compiled select menu: renders itself (`apply`) and owns its behaviour
 * (`onSelect`), exactly like a compiled
 * {@link import("@/discord/interaction/button").Button}. It lives in the
 * interaction layer for the same reason — it carries behaviour, it is not a
 * passive widget.
 */
export interface SelectMenu<B, I extends AnySelectMenuInteraction> {
	readonly id: string;
	readonly onSelect?: (ctx: SelectContext<I>) => Promise<void> | void;
	apply(forceDisabled?: boolean): B;
}

export interface StringSelectOption {
	label: string;
	value: string;
	description?: string;
	emoji?: string;
	default?: boolean;
}

export interface StringSelectDef extends BaseSelectDef<StringSelectMenuInteraction> {
	options: readonly StringSelectOption[];
}

export interface ChannelSelectDef extends BaseSelectDef<ChannelSelectMenuInteraction> {
	/** Restricts what the picker offers, e.g. text channels only. */
	channelTypes?: readonly ChannelType[];
	/**
	 * What the picker opens already holding.
	 *
	 * A picker returns its whole selection, never a delta, so one that opens
	 * empty over a setting that already has a value turns "change this" into
	 * "type the list again" — and anything the administrator forgets to re-pick
	 * is silently dropped.
	 */
	defaultChannelIds?: readonly string[];
}

export interface RoleSelectDef extends BaseSelectDef<RoleSelectMenuInteraction> {
	/** What the picker opens already holding. See {@link ChannelSelectDef.defaultChannelIds}. */
	defaultRoleIds?: readonly string[];
}

export interface UserSelectDef extends BaseSelectDef<UserSelectMenuInteraction> {
	/** What the picker opens already holding. See {@link ChannelSelectDef.defaultChannelIds}. */
	defaultUserIds?: readonly string[];
}

/** Apply the options every select flavour shares onto its builder. */
function applyBaseOptions<B extends AnySelectMenuBuilder>(
	builder: B,
	def: SelectLayout,
	forceDisabled: boolean,
): B {
	builder.setCustomId(def.id);
	applySelectBounds(builder, def);
	builder.setDisabled(forceDisabled || (def.disabled ?? false));
	return builder;
}

/** A menu of caller-defined string values. */
export function createStringSelect(
	def: StringSelectDef,
): SelectMenu<StringSelectMenuBuilder, StringSelectMenuInteraction> {
	return {
		id: def.id,
		onSelect: def.onSelect,
		apply(forceDisabled = false) {
			const builder = applyBaseOptions(new StringSelectMenuBuilder(), def, forceDisabled);
			return builder.addOptions(
				...def.options.map((option) => ({
					label: option.label,
					value: option.value,
					description: option.description,
					emoji: option.emoji,
					default: option.default,
				})),
			);
		},
	};
}

/** A menu populated by Discord with the guild's channels. */
export function createChannelSelect(
	def: ChannelSelectDef,
): SelectMenu<ChannelSelectMenuBuilder, ChannelSelectMenuInteraction> {
	return {
		id: def.id,
		onSelect: def.onSelect,
		apply(forceDisabled = false) {
			const builder = applyBaseOptions(new ChannelSelectMenuBuilder(), def, forceDisabled);
			if (def.defaultChannelIds !== undefined && def.defaultChannelIds.length > 0) {
				builder.setDefaultChannels(...def.defaultChannelIds);
			}
			if (def.channelTypes !== undefined) {
				builder.setChannelTypes(...def.channelTypes);
			}
			return builder;
		},
	};
}

/** A menu populated by Discord with the guild's roles. */
export function createRoleSelect(
	def: RoleSelectDef,
): SelectMenu<RoleSelectMenuBuilder, RoleSelectMenuInteraction> {
	return {
		id: def.id,
		onSelect: def.onSelect,
		apply(forceDisabled = false) {
			const builder = applyBaseOptions(new RoleSelectMenuBuilder(), def, forceDisabled);
			if (def.defaultRoleIds !== undefined && def.defaultRoleIds.length > 0) {
				builder.setDefaultRoles(...def.defaultRoleIds);
			}
			return builder;
		},
	};
}

/**
 * A menu populated by Discord with the guild's members.
 *
 * A distinct flavour from the mentionable one on purpose: naming a person is not
 * the same act as naming a role, and the calls behind it — adding someone to the
 * recap's ping list, granting a user a level — take a user id, not either.
 */
export function createUserSelect(
	def: UserSelectDef,
): SelectMenu<UserSelectMenuBuilder, UserSelectMenuInteraction> {
	return {
		id: def.id,
		onSelect: def.onSelect,
		apply(forceDisabled = false) {
			const builder = applyBaseOptions(new UserSelectMenuBuilder(), def, forceDisabled);
			if (def.defaultUserIds !== undefined && def.defaultUserIds.length > 0) {
				builder.setDefaultUsers(...def.defaultUserIds);
			}
			return builder;
		},
	};
}

/**
 * Wrap a select menu in its own action row. Unlike buttons, Discord gives a
 * select menu a whole row, so there is nothing to group — hence a distinct
 * helper from `createActionRow`.
 */
export function createSelectRow<B extends AnySelectMenuBuilder, I extends AnySelectMenuInteraction>(
	menu: SelectMenu<B, I>,
	forceDisabled = false,
): ActionRowBuilder<B> {
	return new ActionRowBuilder<B>().addComponents(menu.apply(forceDisabled));
}

/**
 * Bridge a select menu's `onSelect` to the persistent
 * {@link import("@/discord/components/component-router").ComponentRouter}.
 *
 * Without this a declared `onSelect` would never run: the router dispatches to a
 * `ComponentHandler`, and nothing else turns an interaction back into the menu
 * that produced it. Register the result through a module's `components`.
 */
export function createSelectHandler<
	B extends AnySelectMenuBuilder,
	I extends AnySelectMenuInteraction,
>(menu: SelectMenu<B, I>, authorize: ComponentAuthorization): ComponentHandler {
	return {
		customId: menu.id,
		// Passed in rather than defaulted: this bridge knows nothing about what
		// the menu does, and a default here would be exactly the silent "anyone
		// may click" the required field exists to prevent.
		authorize,
		async handle(interaction) {
			// The router also routes buttons and modals to a matching customId; a
			// menu only speaks for select interactions.
			if (!interaction.isAnySelectMenu()) {
				return;
			}
			await menu.onSelect?.({ interaction: interaction as I, values: interaction.values });
		},
	};
}
