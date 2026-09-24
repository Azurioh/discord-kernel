import type { CommandInteraction } from "discord.js";
import { type Clock, systemClock } from "@/clock";
import type { Guard, GuardResult } from "@/discord/command/guard";
import { CORE_MESSAGES } from "@/discord/i18n";
import type { LocalizedText } from "@/i18n/translator";

const ALLOW: GuardResult = { ok: true };
const MILLISECONDS_PER_SECOND = 1000;

/** How a cooldown window is shared between callers. */
export type CooldownScope = "user" | "guild" | "global";

export interface CooldownOptions {
	/** Minimum delay between two accepted invocations, in milliseconds. */
	windowMs: number;
	/** Who shares the window. Defaults to `user`. */
	scope?: CooldownScope;
	/** Denial message; receives the whole seconds left before the next attempt. */
	message?: (secondsLeft: number) => LocalizedText;
	/** Injected for tests; defaults to the system clock. */
	clock?: Clock;
}

function defaultMessage(secondsLeft: number): LocalizedText {
	return { key: CORE_MESSAGES.cooldownWait, params: { seconds: secondsLeft } };
}

/**
 * The key sharing one cooldown window. `global` is a constant so every caller
 * collides on purpose; `guild` falls back to the user outside a guild, so a DM
 * can never bypass a guild-scoped cooldown by having no guild id.
 */
function cooldownKey(interaction: CommandInteraction, scope: CooldownScope): string {
	switch (scope) {
		case "global":
			return `${interaction.commandName}:global`;
		case "guild":
			return `${interaction.commandName}:guild:${interaction.guildId ?? interaction.user.id}`;
		case "user":
			return `${interaction.commandName}:user:${interaction.user.id}`;
	}
}

/**
 * Rate-limit a command per user, per guild or globally.
 *
 * Expired entries are pruned on access rather than by a timer: the map is only
 * read when the command runs, so a background interval would keep the process
 * awake for no benefit. Each guard instance owns its map, so two commands never
 * share a window unless they share the guard.
 */
export function createCooldownGuard(options: CooldownOptions): Guard {
	const { windowMs, scope = "user", message = defaultMessage, clock = systemClock } = options;
	const lastUsed = new Map<string, number>();

	return {
		check(interaction: CommandInteraction): GuardResult {
			const now = clock.now().getTime();
			const key = cooldownKey(interaction, scope);
			const previous = lastUsed.get(key);

			if (previous !== undefined && now - previous < windowMs) {
				const secondsLeft = Math.ceil((windowMs - (now - previous)) / MILLISECONDS_PER_SECOND);
				return { ok: false, message: message(secondsLeft) };
			}

			lastUsed.set(key, now);
			pruneExpired(lastUsed, now, windowMs);
			return ALLOW;
		},
	};
}

/** Drop entries whose window has elapsed, so the map cannot grow without bound. */
function pruneExpired(lastUsed: Map<string, number>, now: number, windowMs: number): void {
	for (const [key, timestamp] of lastUsed) {
		if (now - timestamp >= windowMs) {
			lastUsed.delete(key);
		}
	}
}
