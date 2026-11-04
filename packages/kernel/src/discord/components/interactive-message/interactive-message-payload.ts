import type {
	ActionRowBuilder,
	EmbedBuilder,
	MessageActionRowComponentBuilder,
	MessageMentionOptions,
} from "discord.js";
import type { Card } from "@/discord/ui/card";
import type { MessageFile } from "@/discord/ui/message-attachments";

/**
 * What every layout a message can render shares: the files it carries and who
 * it may notify.
 */
interface InteractiveMessagePayloadBase {
	/**
	 * The files this message carries, as its **whole** set — an embed or a
	 * card's `thumbnail`/`gallery` refers to one by name, as
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

/**
 * The message payload shape shared by the initial reply and every update.
 *
 * A discriminated union rather than one shape with an optional `card`:
 * Discord's `IS_COMPONENTS_V2` flag is **irreversible** (once a message carries
 * it, an edit can never clear it) and a message carrying it may hold **no**
 * embed at all — so "embeds" and "card" are not two options on the same
 * message, they are two kinds of message, and mixing their fields must fail to
 * compile rather than build a payload Discord would refuse.
 *
 * `layout` defaults to `"embeds"` — it is optional on that branch alone — so
 * every payload a view already returns (`{ embeds, components }`, no `layout`
 * key at all) keeps satisfying this type unchanged: nothing that predates the
 * card layout has to name the one it was always using.
 */
export type InteractiveMessagePayload<S = never> =
	| (InteractiveMessagePayloadBase & {
			layout?: "embeds";
			embeds: EmbedBuilder[];
			components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
	  })
	| (InteractiveMessagePayloadBase & {
			layout: "card";
			card: Card<S>;
			/**
			 * Rows shown beside the card rather than inside it — a screen's own
			 * controls (reset, back, done). A Components V2 message accepts several
			 * top-level components: the `Container` `card` compiles to is one, and
			 * each of these is an `ActionRow` next to it. Omitted, or empty, for a
			 * payload with no screen-level controls to show right now (a closed
			 * screen).
			 */
			controls?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
			/**
			 * Never present on this branch — declared anyway so that
			 * `InteractiveMessagePayload<S>["components"]`, used elsewhere purely to
			 * name the action-row array type, keeps resolving instead of erroring on
			 * a key one arm of the union does not have.
			 */
			components?: never;
	  });
