import type { BaseInteraction, CommandInteraction } from "discord.js";
import type { ReplyLocaleDeps } from "@/discord/interaction/reply-locale";
import type { LocalizedText } from "@/i18n/translator";

export type GuardResult = { ok: true } | { ok: false; message: LocalizedText };

/**
 * An authorization check run before a command/subcommand handler. Guards are
 * generic by design: the core defines the contract, while concrete rules (admin,
 * role, ownership…) live in the feature module that owns the relevant state.
 *
 * Typed by default on `CommandInteraction` — the base shared by chat-input and
 * context-menu commands — so one guard protects both kinds without a cast. A
 * component handler takes a `Guard<RoutableInteraction>`; a guard written over
 * `BaseInteraction` (such as `requireConfigured`) fits both.
 *
 * `check` is a *property* with a function type, not a method: TypeScript checks
 * method parameters bivariantly, which would let a guard written for
 * `ChatInputCommandInteraction` be attached to a context-menu command and read
 * options that interaction never carries. As a property it is contravariant, so
 * that mistake is a compile error.
 *
 * The pipeline also hands `check` its reply dependencies (translator, logger,
 * `LocaleResolver`), for a guard whose denial text must be built in the reply
 * language; a guard that returns a catalog key can ignore them.
 */
export interface Guard<I extends BaseInteraction = CommandInteraction> {
	readonly check: (interaction: I, runtime?: ReplyLocaleDeps) => GuardResult | Promise<GuardResult>;
}

const ALLOW: GuardResult = { ok: true };

/** Compose guards: every guard must pass, short-circuiting on the first denial. */
export function allOf<I extends BaseInteraction = CommandInteraction>(
	...guards: Guard<I>[]
): Guard<I> {
	return {
		async check(interaction, runtime) {
			for (const guard of guards) {
				const result = await guard.check(interaction, runtime);
				if (!result.ok) {
					return result;
				}
			}
			return ALLOW;
		},
	};
}

/** Pass when any guard passes; otherwise deny with `denyMessage`. */
export function anyOf<I extends BaseInteraction = CommandInteraction>(
	denyMessage: LocalizedText,
	...guards: Guard<I>[]
): Guard<I> {
	return {
		async check(interaction, runtime) {
			for (const guard of guards) {
				const result = await guard.check(interaction, runtime);
				if (result.ok) {
					return ALLOW;
				}
			}
			return { ok: false, message: denyMessage };
		},
	};
}
