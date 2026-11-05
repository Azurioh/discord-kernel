import type { EmbedBuilder, MessageMentionOptions } from "discord.js";
import type { Button } from "@/discord/interaction/button";
import type { AnySelectMenu } from "@/discord/interaction/select-menu";
import type { MessageFile } from "@/discord/ui/message-attachments";

/** What both layouts share: the files a message carries and who it may notify. */
interface ViewBase {
	/**
	 * The files this message carries, as its **whole** set — an embed, a
	 * thumbnail, a gallery item or a `file` node refers to one by name, as
	 * `attachment://<name>`.
	 *
	 * Leaving the key out means "leave the message's attachments alone", which
	 * is what a view carrying no file of its own must do: stating an empty set
	 * would strip whatever the message was sent with. A view that does own its
	 * files states them on every render, empty included, since that is what
	 * makes removing one show up.
	 */
	files?: MessageFile[];
	/**
	 * Who this message may notify.
	 *
	 * Stated by a view that renders text it does not own — user-authored content
	 * carrying mentions — so looking at a preview never pings the people it
	 * names. Left out means Discord's own default, which is what a view building
	 * every string itself wants.
	 */
	allowedMentions?: MessageMentionOptions;
}

/** An image a gallery or a section thumbnail shows. */
export interface MediaItem {
	/** A URL, `attachment://<name>` included for a file the message itself carries. */
	readonly url: string;
	readonly description?: string;
	readonly spoiler?: boolean;
}

/** A block of markdown text. */
export interface TextNode {
	readonly type: "text";
	readonly content: string;
}

/**
 * One to three texts beside exactly one accessory, a button or a thumbnail.
 *
 * Each accessory arm carries the other key as `?: never`: without it,
 * TypeScript's excess-property leniency across a union would accept both keys
 * at once, an accessory Discord refuses.
 */
export interface SectionNode<S = never> {
	readonly type: "section";
	readonly texts: readonly [string] | readonly [string, string] | readonly [string, string, string];
	readonly accessory:
		| { readonly button: Button<S>; readonly thumbnail?: never }
		| { readonly thumbnail: MediaItem; readonly button?: never };
}

/** Vertical space between components, with a line unless `divider` is `false`. */
export interface SeparatorNode {
	readonly type: "separator";
	readonly spacing?: "small" | "large";
	readonly divider?: boolean;
}

/** A grid of images. */
export interface GalleryNode {
	readonly type: "gallery";
	readonly items: readonly MediaItem[];
}

/** A file the message carries, shown inline; `name` matches one of its attachments. */
export interface FileNode {
	readonly type: "file";
	readonly name: string;
	readonly spoiler?: boolean;
}

/** An action row of buttons. */
export interface ButtonsRow<S = never> {
	readonly type: "buttons";
	readonly buttons: readonly Button<S>[];
}

/** An action row holding one select menu, which fills it. */
export interface SelectRow {
	readonly type: "select";
	readonly menu: AnySelectMenu;
}

/** An action row, in either layout. */
export type ViewRow<S = never> = ButtonsRow<S> | SelectRow;

/** What a container may hold: every component but another container. */
export type ContainerChild<S = never> =
	| TextNode
	| SectionNode<S>
	| SeparatorNode
	| GalleryNode
	| FileNode
	| ViewRow<S>;

/**
 * A box grouping components, with an optional accent colour on its left edge.
 *
 * `null` children are skipped: a conditional child is declared in place, at the
 * position it would occupy.
 */
export interface ContainerNode<S = never> {
	readonly type: "container";
	readonly accent?: number;
	readonly spoiler?: boolean;
	readonly children: readonly (ContainerChild<S> | null)[];
}

/** A top-level component of a Components V2 message. */
export type V2Component<S = never> = ContainerNode<S> | ContainerChild<S>;

/** A message built from content, embeds and action rows. */
export interface V1View<S = never> extends ViewBase {
	content?: string;
	embeds?: readonly EmbedBuilder[];
	/** `null` rows are skipped. */
	rows?: readonly (ViewRow<S> | null)[];
	components?: never;
}

/** A Components V2 message: components only, no content or embeds. */
export interface V2View<S = never> extends ViewBase {
	/** `null` components are skipped. */
	components: readonly (V2Component<S> | null)[];
	content?: never;
	embeds?: never;
	rows?: never;
}

/**
 * What a message shows, as data: `renderView` turns it into the options every
 * send kind takes. The presence of `components` picks the layout; V1 and V2
 * fields cannot meet. `S` is the state its buttons render against, `never` for
 * a view without stateful controls.
 */
export type View<S = never> = V1View<S> | V2View<S>;
