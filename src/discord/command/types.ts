import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "discord.js";
import type { Presenter } from "@/discord/presenter";
import type { Translator } from "@/i18n";
import type { Logger } from "@/logger";

/**
 * Per-request dependencies injected into the command pipeline by the router.
 * Passing these at dispatch time (rather than importing singletons) keeps the
 * framework free of global state and trivially testable.
 */
export interface CommandRuntime {
	readonly presenter: Presenter;
	readonly logger: Logger;
	readonly translator: Translator;
}

/**
 * The framework's slash-command contract. `data` is a discord.js builder (or
 * anything with `.toJSON()`); `dispatch` routes an interaction using the
 * supplied runtime. `guildIds` restricts deployment to specific guild(s); when
 * omitted the command is deployed globally (available on every server).
 */
export interface SlashCommand {
	readonly data: { name: string; toJSON?: () => unknown };
	readonly guildIds?: readonly string[];
	dispatch(interaction: ChatInputCommandInteraction, runtime: CommandRuntime): Promise<void>;
	/**
	 * Answer an autocomplete request for one of this command's options. Present
	 * only when at least one option declares a resolver, so the dispatcher can
	 * skip commands that never autocomplete.
	 */
	autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

/**
 * A context-menu (a.k.a. application) command: the entry a user gets by
 * right-clicking a member or a message. It shares deployment and permissions
 * with a slash command, but carries no name to type and no options — only the
 * target the user clicked.
 */
export interface ContextMenuCommand {
	readonly data: { name: string; toJSON?: () => unknown };
	readonly guildIds?: readonly string[];
	dispatch(interaction: ContextMenuCommandInteraction, runtime: CommandRuntime): Promise<void>;
}

/** Anything the command router can register and deploy to Discord. */
export type DeployableCommand = SlashCommand | ContextMenuCommand;
