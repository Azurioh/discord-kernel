import type { ContextMenuCommand, SlashCommand } from "@/discord/command/types";
import type { ComponentHandler } from "@/discord/components/component-router";
import type { DiscordEvent } from "@/discord/events/types";
import type { Catalog } from "@/i18n/catalog";
import type { ScheduledJob } from "@/scheduler/scheduler";
import type { SettingsDeclaration } from "@/settings/define-settings";

/**
 * A self-contained vertical feature slice. A module bundles everything it
 * contributes to the bot — commands, gateway events, scheduled jobs — and an
 * optional async `setup` for one-off work (creating indexes, migrations…).
 *
 * Modules are produced by factories that receive the application container (see
 * `bootstrap/container.ts`), so all dependencies are injected — never imported
 * as singletons. The core depends only on this output contract, never on how a
 * module is wired.
 */
export interface BotModule {
	/** Stable identifier, used in logs. */
	readonly name: string;
	readonly commands?: readonly SlashCommand[];
	/** Right-click entries on a member or a message (the Apps submenu). */
	readonly contextMenuCommands?: readonly ContextMenuCommand[];
	/** Persistent component/modal handlers (routed by `customId`). */
	readonly components?: readonly ComponentHandler[];
	readonly events?: readonly DiscordEvent[];
	readonly jobs?: readonly ScheduledJob[];
	/**
	 * The module's translation catalog (keys namespaced by module name). The
	 * composition root registers it into the shared registry at boot — a
	 * duplicate key across modules fails the boot, never a runtime lookup.
	 */
	readonly translations?: Catalog;
	/**
	 * The module's settings declarations. The composition root collects them into
	 * the settings registry at boot, the same way it collects `translations`.
	 */
	readonly settings?: readonly SettingsDeclaration[];
	/** Whether the module starts enabled in a guild that never toggled it. Defaults to `true`. */
	readonly defaultEnabled?: boolean;
	/** One-off initialisation run once at boot, after the client is ready. */
	setup?(): Promise<void> | void;
	/**
	 * Symmetric counterpart of {@link setup}, awaited during graceful shutdown
	 * before the client and the database are closed. Release what the module owns
	 * and the framework cannot see — timers, collectors, third-party connections.
	 * A rejecting teardown is logged and never aborts the shutdown of the others.
	 */
	teardown?(): Promise<void> | void;
}
