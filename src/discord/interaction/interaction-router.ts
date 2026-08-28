import type { Interaction } from "discord.js";

/**
 * Anything that can consume a gateway interaction. `handle` returns `true` when
 * it claimed the interaction, `false` to let the next dispatcher try. This is the
 * seam that lets the whole app share a single `interactionCreate` listener.
 */
export interface InteractionDispatcher {
	handle(interaction: Interaction): Promise<boolean>;
}

/**
 * Aggregates {@link InteractionDispatcher}s behind one entry point so the app
 * registers a *single* `interactionCreate` listener (wired at the composition
 * root, attached in `bootstrap/lifecycle`). Dispatchers are tried in order and
 * the first to claim the interaction wins — no global state, no singleton.
 */
export class InteractionRouter {
	constructor(private readonly dispatchers: readonly InteractionDispatcher[]) {}

	async dispatch(interaction: Interaction): Promise<void> {
		for (const dispatcher of this.dispatchers) {
			if (await dispatcher.handle(interaction)) {
				return;
			}
		}
	}
}
