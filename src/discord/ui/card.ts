import {
	ActionRowBuilder,
	ContainerBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js";
import { type Button, createActionRow } from "@/discord/interaction/button";
import type { AnySelectMenuBuilder } from "@/discord/interaction/select-menu";

/** Discord refuses a message carrying more components than this, container included. */
export const MAX_CARD_COMPONENTS = 40;

/** Discord's cap on the characters carried by every `TextDisplay` in a message, summed. */
export const MAX_CARD_TEXT_CHARACTERS = 4000;

/** One image inside a `gallery` block. */
export interface CardImage {
	/** A URL, `attachment://` included for a file the message itself carries. */
	readonly url: string;
	readonly description?: string;
	readonly spoiler?: boolean;
}

/**
 * The two shapes an `entry` may carry besides its text, plus the bare one with
 * neither.
 *
 * Modelled as a three-way union rather than one shape with two optional
 * fields: Discord's `Section` accepts exactly **one** accessory, so `action`
 * and `thumbnail` together is not a looser version of the block, it is an
 * invalid one. A two-optional-field shape would only catch that at
 * `apply()`, with Discord's own rejection as the first symptom; this union
 * makes the combination fail to compile instead. Each arm carries the other
 * field as `?: never` — without it, TypeScript's leniency on excess
 * properties across a union (a property valid on *any* arm is accepted on
 * all of them) would let both through anyway.
 */
export type CardEntryAccessory<S> =
	| { readonly action?: never; readonly thumbnail?: never }
	| { readonly action: Button<S>; readonly thumbnail?: never }
	| { readonly action?: never; readonly thumbnail: string };

/**
 * What a compiled select menu must offer for a card to render it — `apply`
 * only, never `onSelect`.
 *
 * `SelectMenu<B, I>` (the DSL's own compiled shape) is contravariant in `I`,
 * so a `SelectMenu<StringSelectMenuBuilder, StringSelectMenuInteraction>` —
 * what `createStringSelect` hands back — is not assignable to a version
 * fixed at the union `AnySelectMenuInteraction`. A card never reads
 * `onSelect` (that is wired separately, through the module's
 * `ComponentRouter`), so this asks for nothing beyond what it actually
 * calls, and every flavour of compiled select menu satisfies it as-is.
 */
export interface CardSelectMenu {
	readonly id: string;
	apply(forceDisabled?: boolean): AnySelectMenuBuilder;
}

/**
 * One piece of a card, declared as data rather than built. `createCard`
 * compiles a list of these into a `ContainerBuilder`, the same split
 * `createButton`/`createModal`/`createStringSelect` keep between a
 * definition and the builder it compiles to.
 */
export type CardBlock<S> =
	| { readonly kind: "text"; readonly content: string }
	| ({
			readonly kind: "entry";
			readonly title: string;
			readonly lines?: readonly string[];
	  } & CardEntryAccessory<S>)
	| { readonly kind: "controls"; readonly buttons: readonly Button<S>[] }
	| { readonly kind: "select"; readonly menu: CardSelectMenu }
	| {
			readonly kind: "separator";
			readonly spacing?: "small" | "large";
			readonly divider?: boolean;
	  }
	| { readonly kind: "gallery"; readonly images: readonly CardImage[] };

export interface CardDef<S> {
	/** The container's left-edge accent colour — see `EMBED_COLORS` for the bot's palette. */
	readonly accent?: number;
	/**
	 * The card's content, top to bottom.
	 *
	 * `null` entries are accepted and skipped: a conditional block is declared
	 * in place, at the position it would occupy, rather than assembled into a
	 * separate array the caller builds beside this one and has to keep in
	 * sync.
	 */
	readonly blocks: readonly (CardBlock<S> | null)[];
}

/**
 * A compiled card: knows how to render itself for a given state. Mirrors
 * `Button<S>.apply` (`src/core/discord/interaction/button.ts`) on purpose —
 * same parameters, same meaning for `forceDisabled` — which is what lets
 * `disabledControls` neutralise a card exactly the way it neutralises a
 * button row: by applying it a second time with `true`, no special case
 * required.
 */
export interface Card<S> {
	apply(state: S, forceDisabled?: boolean): ContainerBuilder;
}

/**
 * The text an `entry` block renders, whether it ends up alone in a
 * `TextDisplay` or riding along inside a `Section`.
 *
 * Composed as one `TextDisplay` — the title in bold, then each line on its
 * own row — rather than one `TextDisplay` per line: a `Section` holds at
 * most three text children, so a title plus more than two lines would
 * already be out of room, and a single block reads as one paragraph instead
 * of a list of unrelated fragments.
 */
function entryContent<S>(block: Extract<CardBlock<S>, { kind: "entry" }>): string {
	const lines = block.lines ?? [];
	return lines.length === 0 ? `**${block.title}**` : `**${block.title}**\n${lines.join("\n")}`;
}

/** How many characters of the 4000-character `TextDisplay` budget a block spends. */
function textCharacters<S>(block: CardBlock<S>): number {
	if (block.kind === "text") {
		return block.content.length;
	}
	if (block.kind === "entry") {
		return entryContent(block).length;
	}
	return 0;
}

/** How many components a block compiles to, container itself excluded. */
function componentCount<S>(block: CardBlock<S>): number {
	switch (block.kind) {
		case "text":
			return 1;
		case "entry":
			// No accessory: one `TextDisplay`. Either accessory: the `Section`
			// itself, its one `TextDisplay` child, and the accessory — three.
			return block.action !== undefined || block.thumbnail !== undefined ? 3 : 1;
		case "controls":
			// The `ActionRow` plus every button it carries.
			return 1 + block.buttons.length;
		case "select":
			// The `ActionRow` plus the menu itself.
			return 2;
		case "separator":
			return 1;
		case "gallery":
			// Discord counts the gallery as one component; its items are data on
			// it, not components of their own, the same way an embed's fields
			// are not counted individually.
			return 1;
	}
}

/**
 * Refuse a card Discord would refuse, naming what is over budget and by how
 * much — the pattern `settings-editor.view.ts` (`assertFits`) already uses
 * for a select menu's option cap. Checked once, at `createCard`, rather than
 * at `apply()`: the block list does not vary with state, so failing here
 * names the declaration instead of surfacing as a rejected message at
 * whichever render happens to trip it first.
 */
function assertFitsBudget<S>(blocks: readonly CardBlock<S>[]): void {
	// +1 for the container itself, which is a component in its own right.
	const totalComponents = 1 + blocks.reduce((sum, block) => sum + componentCount(block), 0);
	const totalCharacters = blocks.reduce((sum, block) => sum + textCharacters(block), 0);

	const problems: string[] = [];
	if (totalComponents > MAX_CARD_COMPONENTS) {
		problems.push(
			`${totalComponents} components (container included), Discord allows ${MAX_CARD_COMPONENTS} — ${
				totalComponents - MAX_CARD_COMPONENTS
			} over`,
		);
	}
	if (totalCharacters > MAX_CARD_TEXT_CHARACTERS) {
		problems.push(
			`${totalCharacters} characters across its text, Discord allows ${MAX_CARD_TEXT_CHARACTERS} — ${
				totalCharacters - MAX_CARD_TEXT_CHARACTERS
			} over`,
		);
	}
	if (problems.length > 0) {
		throw new Error(`Card exceeds Discord's budget: ${problems.join("; ")}.`);
	}
}

/** Render one `entry` block: a `Section` with an accessory, or a bare `TextDisplay`. */
function applyEntry<S>(
	container: ContainerBuilder,
	block: Extract<CardBlock<S>, { kind: "entry" }>,
	state: S,
	forceDisabled: boolean,
): void {
	const text = new TextDisplayBuilder().setContent(entryContent(block));
	if (block.action !== undefined) {
		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(text)
				.setButtonAccessory(block.action.apply(state, forceDisabled)),
		);
		return;
	}
	if (block.thumbnail !== undefined) {
		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(text)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(block.thumbnail)),
		);
		return;
	}
	container.addTextDisplayComponents(text);
}

/** Render one block onto the container being built, for the given state. */
function applyBlock<S>(
	container: ContainerBuilder,
	block: CardBlock<S>,
	state: S,
	forceDisabled: boolean,
): void {
	switch (block.kind) {
		case "text":
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(block.content));
			return;
		case "entry":
			applyEntry(container, block, state, forceDisabled);
			return;
		case "controls":
			container.addActionRowComponents(
				createActionRow([...block.buttons], state, { disableAll: forceDisabled }),
			);
			return;
		case "select":
			container.addActionRowComponents(
				new ActionRowBuilder<AnySelectMenuBuilder>().addComponents(block.menu.apply(forceDisabled)),
			);
			return;
		case "separator": {
			const separator = new SeparatorBuilder();
			if (block.spacing !== undefined) {
				separator.setSpacing(
					block.spacing === "large" ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small,
				);
			}
			if (block.divider !== undefined) {
				separator.setDivider(block.divider);
			}
			container.addSeparatorComponents(separator);
			return;
		}
		case "gallery":
			container.addMediaGalleryComponents(
				new MediaGalleryBuilder().addItems(
					...block.images.map((image) => {
						const item = new MediaGalleryItemBuilder().setURL(image.url);
						if (image.description !== undefined) {
							item.setDescription(image.description);
						}
						if (image.spoiler !== undefined) {
							item.setSpoiler(image.spoiler);
						}
						return item;
					}),
				),
			);
			return;
	}
}

/**
 * Declare a card: a definition compiling to a `ContainerBuilder`, the
 * Components V2 analogue of an embed. Follows the same split as
 * `createButton`/`createModal`/`createStringSelect` — data in, a compiled
 * value with an `apply` out — so a caller never touches a V2 builder
 * directly.
 */
export function createCard<S>(def: CardDef<S>): Card<S> {
	const blocks = def.blocks.filter((block): block is CardBlock<S> => block !== null);
	assertFitsBudget(blocks);

	return {
		apply(state, forceDisabled = false) {
			const container = new ContainerBuilder();
			if (def.accent !== undefined) {
				container.setAccentColor(def.accent);
			}
			for (const block of blocks) {
				applyBlock(container, block, state, forceDisabled);
			}
			return container;
		},
	};
}
