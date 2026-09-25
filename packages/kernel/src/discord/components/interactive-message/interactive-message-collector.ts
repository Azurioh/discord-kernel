import type {
	ActionRowBuilder,
	AnySelectMenuInteraction,
	ButtonInteraction,
	ChatInputCommandInteraction,
	CollectedMessageInteraction,
	ContainerBuilder,
	EmbedBuilder,
	InteractionUpdateOptions,
	MessageActionRowComponentBuilder,
	MessageMentionOptions,
} from "discord.js";
import { toMessageEditOptions } from "@/discord/components/interactive-message/message-edit-options";
import type { StateStore } from "@/discord/components/interactive-message/state-store";
import type { Button, ComponentContext } from "@/discord/interaction/button";
import type { Card } from "@/discord/ui/card";
import type { MessageFile } from "@/discord/ui/message-attachments";
import { describeError } from "@/errors/describe-error";
import type { Logger } from "@/logger";

/** How long an interactive message stays live without a click. */
export const COLLECTOR_IDLE_MS = 5 * 60 * 1000;

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

/**
 * What {@link InteractiveView.disabledControls} hands back: enough of a payload
 * to neutralise the message's controls in place, in whichever layout the view
 * renders.
 *
 * Not `Pick<InteractiveMessagePayload<S>, "components">` alone — on the card
 * branch that type is `{ components?: never }`, since a card carries `render`'s
 * controls beside its one container rather than inside it, as top-level
 * `components` of its own kind. The second arm is what lets a card screen hand
 * back its neutralised container *and* its neutralised outer row together —
 * `Card.apply(state, true)` for the former, the same `createActionRow(...,
 * { disableAll: true })` `render` already builds the row with for the latter —
 * see {@link import("@/discord/ui/card").Card}.
 */
export type DisabledInteractiveMessageComponents<S> =
	| Pick<InteractiveMessagePayload<S>, "components">
	| {
			readonly components: readonly (
				| ContainerBuilder
				| ActionRowBuilder<MessageActionRowComponentBuilder>
			)[];
	  };

/**
 * Turns a state into a message payload. Everything sent to Discord goes through
 * here, so the collector never builds a payload of its own and the initial
 * render can never drift from the updates.
 */
export interface InteractiveView<S> {
	render(state: S): InteractiveMessagePayload<S>;
	disabledControls(state: S): DisabledInteractiveMessageComponents<S>;
}

/**
 * What a pick hands to its handler: the triggering interaction, the values
 * Discord sent back already unwrapped, and the same `state`/`update` pairing a
 * button's {@link ComponentContext} carries.
 */
export interface SelectComponentContext<S> {
	readonly interaction: AnySelectMenuInteraction;
	readonly values: readonly string[];
	readonly state: S;
	update(next: S): Promise<void>;
}

/**
 * A select menu's behaviour inside an interactive message: the custom id the
 * collector routes on, and what a pick does with the current state.
 *
 * Only the behaviour, unlike {@link Button} which also renders itself: a
 * compiled select menu's rendering does not vary with the state, so it stays
 * where the rest of the message is built — in the view.
 */
export interface InteractiveSelect<S> {
	readonly id: string;
	onSelect(ctx: SelectComponentContext<S>): Promise<void> | void;
}

export interface InteractiveMessageCollectorDeps<S> {
	interaction: ChatInputCommandInteraction;
	response: Awaited<ReturnType<ChatInputCommandInteraction["editReply"]>>;
	buttons: Button<S>[];
	/** Omitted by a message whose controls are all buttons. */
	selects?: InteractiveSelect<S>[];
	view: InteractiveView<S>;
	store: StateStore<S>;
	ownerId: string;
	idleMs: number;
	/**
	 * Run once the message stops reacting, whichever way it ended — an explicit
	 * {@link InteractiveMessageHandle.stop} or the idle deadline.
	 *
	 * This is where work that must not repeat at every click belongs: a settings
	 * screen pushing its result to whatever it configures, so what it configures
	 * never shows the half-finished states an administrator passed through. A
	 * failure is logged, never thrown — the message has already ended.
	 */
	onEnd?: () => Promise<void> | void;
	logger: Logger;
}

/**
 * Attach the interaction/idle wiring to an already-sent message: it owns the
 * collector, routes each interaction by custom ID to the button's `onClick` or
 * the select menu's `onSelect`, scopes every interaction to the owner, and
 * centralises error handling. Mirrors command `dispatch`.
 *
 * Generic over the state so the same mechanism serves anything whose controls
 * react for a bounded lifetime — pagination, a settings screen, a confirmation.
 * Persistent components that must survive a restart belong to the
 * {@link import("@/discord/components/component-router").ComponentRouter}
 * instead: this state lives in memory and dies on idle.
 */
export interface InteractiveMessageHandle {
	/**
	 * End the message's interactive life **without** neutralising its controls.
	 *
	 * For callers that have already rendered a final state — a confirmed
	 * deletion, say — where the usual "disable on end" edit would target a
	 * message, or a channel, that no longer exists. `onEnd` still runs.
	 */
	stop(): void;
}

export function mountInteractiveMessageCollector<S>(
	deps: InteractiveMessageCollectorDeps<S>,
): InteractiveMessageHandle {
	const { interaction, response, buttons, view, store, ownerId, idleMs, logger } = deps;
	const selects = deps.selects ?? [];

	function renderOnto(collected: CollectedMessageInteraction, next: S): InteractionUpdateOptions {
		return toMessageEditOptions(
			view.render(next),
			[...collected.message.attachments.values()],
			next,
		);
	}

	function createClickContext(clicked: ButtonInteraction): ComponentContext<S> {
		return {
			interaction: clicked,
			state: store.read(),
			update: async (next) => {
				store.write(next);
				await clicked.update(renderOnto(clicked, next));
			},
		};
	}

	function createPickContext(picked: AnySelectMenuInteraction): SelectComponentContext<S> {
		return {
			interaction: picked,
			values: picked.values,
			state: store.read(),
			update: async (next) => {
				store.write(next);
				await picked.update(renderOnto(picked, next));
			},
		};
	}

	async function route(collected: CollectedMessageInteraction): Promise<void> {
		if (collected.isButton()) {
			const target = buttons.find((entry) => entry.id === collected.customId);
			await target?.onClick?.(createClickContext(collected));
			return;
		}
		if (collected.isAnySelectMenu()) {
			const target = selects.find((entry) => entry.id === collected.customId);
			await target?.onSelect(createPickContext(collected));
		}
	}

	async function handleCollected(collected: CollectedMessageInteraction): Promise<void> {
		try {
			await route(collected);
		} catch (error) {
			// At `error`, and with everything the throw carried: whatever lands here
			// left the click unanswered — Discord tells the administrator the
			// interaction failed — so it is a defect to be found, not a hiccup. The
			// custom id says which control it was, since the state that produced it
			// is gone by the time anybody reads this.
			logger.error(
				{ err: describeError(error), customId: collected.customId },
				"Failed to update interactive message",
			);
		}
	}

	function disableOnEnd(): void {
		// The message outlives the collector, so leave the controls visibly inert
		// instead of letting clicks fail silently.
		interaction.editReply(view.disabledControls(store.read())).catch((error) => {
			logger.warn({ err: describeError(error) }, "Failed to disable interactive message controls");
		});
	}

	/**
	 * A caller that stops the message itself has already rendered the final state,
	 * so the disabling edit would be at best redundant and at worst aimed at
	 * something that is gone. `onEnd` still runs: it answers "the message is over",
	 * not "the message timed out".
	 */
	let stoppedByCaller = false;

	async function handleEnd(): Promise<void> {
		if (!stoppedByCaller) {
			disableOnEnd();
		}
		try {
			await deps.onEnd?.();
		} catch (error) {
			logger.warn({ err: describeError(error) }, "Failed to close interactive message");
		}
	}

	// No `componentType`: the collector takes every message component the view
	// renders — buttons and select menus alike — and `route` sorts them out.
	const collector = response.createMessageComponentCollector({
		// `idle` rearms on every collected interaction, so each click grants a
		// fresh window rather than counting down from the first render.
		idle: idleMs,
		filter: (collected) => collected.user.id === ownerId,
	});

	collector.on("collect", handleCollected);
	// One `end` listener for both ways out, so nothing an ending owes — inert
	// controls, `onEnd` — depends on which one happened.
	collector.on("end", handleEnd);

	return {
		stop() {
			stoppedByCaller = true;
			collector.stop();
		},
	};
}
