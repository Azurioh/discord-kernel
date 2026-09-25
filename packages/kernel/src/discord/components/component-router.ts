import {
	type AnySelectMenuInteraction,
	type ButtonInteraction,
	type Interaction,
	MessageFlags,
	type ModalSubmitInteraction,
} from "discord.js";
import { CORE_MESSAGES } from "@/discord/i18n";
import type { InteractionDispatcher } from "@/discord/interaction/interaction-router";
import type { LocaleResolver } from "@/discord/interaction/locale-resolver";
import { replyLocale } from "@/discord/interaction/reply-locale";
import { formatPermissions, missingPermissions, type PermissionBit } from "@/discord/permissions";
import type { Presenter } from "@/discord/presenter";
import { isModuleDisabled } from "@/discord/settings/is-module-disabled";
import { moduleDisabledEmbed } from "@/discord/settings/module-disabled-embed";
import { errorMessage } from "@/errors/error-message";
import type { Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";
import type { ModuleGate } from "@/settings/system/module-gate";

/**
 * Interactions a {@link ComponentHandler} can be routed: message components
 * (buttons, any select menu) and modal submissions.
 */
export type RoutableInteraction =
	| ButtonInteraction
	| AnySelectMenuInteraction
	| ModalSubmitInteraction;

/** Per-dispatch dependencies, injected by the router (mirrors `CommandRuntime`). */
export interface ComponentRuntime {
	readonly presenter: Presenter;
	readonly logger: Logger;
	readonly translator: Translator;
	/** The bot's reply-language resolver, if it gave one (see `ComponentRouterDeps`). */
	readonly localeResolver?: LocaleResolver;
}

/**
 * Who may act on a component.
 *
 * A command declares its audience through `defaultMemberPermissions` + a
 * `Guard`, and `Guard` is typed on `CommandInteraction` — deliberately, so a
 * guard cannot be attached to a button. That leaves a component with no
 * framework-level place to state who may click it, and the only thing standing
 * between a member and a destructive button is whether whoever wrote the
 * handler remembered to check. Every existing handler does; nothing makes the
 * next one.
 *
 * So the answer is required by the type. There is no default and no optional
 * field: a handler that says nothing does not compile, and "anyone may click
 * this" has to be written down and justified rather than reached by omission.
 */
export type ComponentAuthorization =
	/** Any member may click. `because` is why that is safe, not decoration. */
	| { readonly kind: "anyone"; readonly because: string }
	/** The router denies unless the member holds every listed permission. */
	| { readonly kind: "permissions"; readonly required: readonly PermissionBit[] }
	/**
	 * The handler decides for itself, because the answer depends on state the
	 * router cannot see — whether this member opened *this* ticket, say.
	 */
	| { readonly kind: "handler"; readonly because: string };

/**
 * A persistent component handler, routed by `customId`. It claims an interaction
 * whose customId equals `customId` or starts with `${customId}:`, so dynamic
 * state can be appended after a colon (e.g. handler `role` claims `role:add:123`).
 *
 * Best practice — handler (this) vs collector ({@link import("@/discord/components/paginator").mountPaginator}):
 * use a **handler** for *persistent* components that must keep working forever and
 * survive a restart (role pickers, ticket/verify buttons); the bot has no
 * in-memory closure after a restart, so encode state in the customId (or refetch
 * it). Use a **collector** for *transient*, single-message, owner-scoped flows
 * with a lifetime (pagination, a confirm dialog) — its state lives in memory and
 * dies on idle.
 */
export interface ComponentHandler {
	readonly customId: string;
	/** Who may act on this component. Required: see {@link ComponentAuthorization}. */
	readonly authorize: ComponentAuthorization;
	handle(interaction: RoutableInteraction, runtime: ComponentRuntime): Promise<void> | void;
}

export interface ComponentRouterDeps {
	presenter: Presenter;
	logger: Logger;
	translator: Translator;
	/**
	 * When given, a handler registered with a module does not run on a guild
	 * where that module is disabled: the member gets the translated "disabled
	 * on this server" message instead (FR-036).
	 */
	gate?: ModuleGate;
	/**
	 * Where the router's own replies (denials) read their language, also handed
	 * to the handlers through the runtime. Without one, the interaction's own
	 * locales are used.
	 */
	localeResolver?: LocaleResolver;
}

function isRoutable(interaction: Interaction): interaction is RoutableInteraction {
	return interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit();
}

/**
 * Routes persistent component/modal interactions to registered handlers by
 * `customId`, injecting the shared {@link ComponentRuntime}. It does not attach
 * its own listener — it is an {@link InteractionDispatcher} driven by the shared
 * {@link import("@/discord/interaction/interaction-router").InteractionRouter},
 * so commands and components share a single `interactionCreate` listener.
 */
export class ComponentRouter implements InteractionDispatcher {
	private readonly handlers: ComponentHandler[] = [];
	/** The module each handler was registered for; absent means never gated. */
	private readonly modules = new Map<ComponentHandler, string>();
	private readonly runtime: ComponentRuntime;

	constructor(private readonly deps: ComponentRouterDeps) {
		this.runtime = {
			presenter: deps.presenter,
			logger: deps.logger,
			translator: deps.translator,
			localeResolver: deps.localeResolver,
		};
	}

	/**
	 * @param moduleName - the module the handler belongs to, so the gate can
	 * skip it on guilds where that module is disabled. Omit it for a handler
	 * that always runs.
	 */
	register(handler: ComponentHandler, moduleName?: string): this {
		this.handlers.push(handler);
		if (moduleName !== undefined) {
			this.modules.set(handler, moduleName);
		}
		return this;
	}

	/** Register many handlers at once, all of `moduleName` when given. */
	registerAll(handlers: Iterable<ComponentHandler>, moduleName?: string): this {
		for (const handler of handlers) {
			this.register(handler, moduleName);
		}
		return this;
	}

	private match(customId: string): ComponentHandler | undefined {
		return this.handlers.find(
			(handler) => customId === handler.customId || customId.startsWith(`${handler.customId}:`),
		);
	}

	/** Claim and route component/modal interactions by `customId`; ignore the rest. */
	async handle(interaction: Interaction): Promise<boolean> {
		if (!isRoutable(interaction)) {
			return false;
		}
		const handler = this.match(interaction.customId);
		if (!handler) {
			return false;
		}
		// First: a disabled module answers the same way whoever clicks.
		if (!(await this.passesGate(interaction, handler))) {
			return true;
		}
		// Before the handler runs, so a declared permission cannot be bypassed by a
		// handler that forgot to check it.
		if (!(await this.passesAuthorization(interaction, handler))) {
			return true;
		}
		try {
			await handler.handle(interaction, this.runtime);
		} catch (error) {
			this.deps.logger.error(
				{
					customId: interaction.customId,
					err: errorMessage(error),
				},
				"Component handler failed",
			);
		}
		return true;
	}

	/** Answer the member and return `false` when the handler's module is disabled on the guild. */
	private async passesGate(
		interaction: RoutableInteraction,
		handler: ComponentHandler,
	): Promise<boolean> {
		const disabled = await isModuleDisabled({
			gate: this.deps.gate,
			moduleName: this.modules.get(handler),
			guildId: interaction.guildId,
		});
		if (disabled) {
			await interaction.reply({
				embeds: [await moduleDisabledEmbed(interaction, this.deps)],
				flags: MessageFlags.Ephemeral,
			});
		}
		return !disabled;
	}

	/**
	 * Enforce the handler's declared audience. Only `permissions` is enforceable
	 * here — the other two kinds are statements about a decision made elsewhere,
	 * and their value is that the handler had to state one.
	 *
	 * `memberPermissions` is `null` outside a guild; that is a denial, since an
	 * unknown permission set must never be read as a granted one — the same rule
	 * `createPermissionGuard` follows for commands.
	 */
	private async passesAuthorization(
		interaction: RoutableInteraction,
		handler: ComponentHandler,
	): Promise<boolean> {
		if (handler.authorize.kind !== "permissions") {
			return true;
		}
		const missing = missingPermissions(interaction.memberPermissions, handler.authorize.required);
		if (missing.length === 0) {
			return true;
		}

		const locale = await replyLocale(interaction, this.deps);
		const message = this.deps.translator.translate(locale, CORE_MESSAGES.guardPermissionDenied, {
			missing: formatPermissions(missing),
		});
		await interaction.reply({
			embeds: [this.deps.presenter.denial(message, locale)],
			flags: MessageFlags.Ephemeral,
		});
		return false;
	}
}
