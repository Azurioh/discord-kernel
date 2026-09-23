import type { CommandInteraction } from "discord.js";
import type { LocalizedText } from "@/i18n/translator";

export type GuardResult = { ok: true } | { ok: false; message: LocalizedText };

/**
 * An authorization check run before a command/subcommand handler. Guards are
 * generic by design: the core defines the contract, while concrete rules (admin,
 * role, ownership…) live in the feature module that owns the relevant state.
 *
 * Typed on `CommandInteraction` — the base shared by chat-input and context-menu
 * commands — so one guard protects both kinds without a cast.
 *
 * `check` is a *property* with a function type, not a method: TypeScript checks
 * method parameters bivariantly, which would let a guard written for
 * `ChatInputCommandInteraction` be attached to a context-menu command and read
 * options that interaction never carries. As a property it is contravariant, so
 * that mistake is a compile error.
 */
export interface Guard {
	readonly check: (interaction: CommandInteraction) => GuardResult | Promise<GuardResult>;
}

const ALLOW: GuardResult = { ok: true };

/** Compose guards: every guard must pass, short-circuiting on the first denial. */
export function allOf(...guards: Guard[]): Guard {
	return {
		async check(interaction) {
			for (const guard of guards) {
				const result = await guard.check(interaction);
				if (!result.ok) {
					return result;
				}
			}
			return ALLOW;
		},
	};
}

/** Pass when any guard passes; otherwise deny with `denyMessage`. */
export function anyOf(denyMessage: LocalizedText, ...guards: Guard[]): Guard {
	return {
		async check(interaction) {
			for (const guard of guards) {
				const result = await guard.check(interaction);
				if (result.ok) {
					return ALLOW;
				}
			}
			return { ok: false, message: denyMessage };
		},
	};
}
