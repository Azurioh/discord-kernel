import {
	ApplicationCommandType,
	ContextMenuCommandBuilder,
	type ContextMenuCommandInteraction,
	InteractionContextType,
	type LocalizationMap,
	type Message,
	MessageFlags,
	type User,
} from "discord.js";
import {
	type CommandResponders,
	createCommandResponders,
} from "@/discord/command/command-responders";
import { ContextMenuTargetError } from "@/discord/command/errors";
import type { Guard } from "@/discord/command/guard";
import { passesGuard } from "@/discord/command/passes-guard";
import { renderCommandFailure } from "@/discord/command/render-command-failure";
import type { CommandRuntime, ContextMenuCommand } from "@/discord/command/types";
import { replyLocale } from "@/discord/interaction/reply-locale";
import { type PermissionBit, resolvePermissions } from "@/discord/permissions";
import type { LocalizedText } from "@/i18n/translator";

/**
 * Context-menu commands: the entries a user reaches by right-clicking a member
 * ("user" target) or a message ("message" target), under the Apps submenu.
 *
 * They are declared here rather than through `createCommand` because they are a
 * different application command type: no name is typed, no options are parsed —
 * the interaction carries the clicked target instead. Everything else (guards,
 * permissions, error rendering) mirrors the slash-command pipeline so a module
 * writes both the same way.
 */

/** The target handed to the handler, discriminated by the command's kind. */
export interface ContextMenuTarget {
	readonly user: User;
	readonly message: Message;
}

export interface ContextMenuContext<K extends keyof ContextMenuTarget> extends CommandResponders {
	readonly interaction: ContextMenuCommandInteraction;
	/** The right-clicked member or message. */
	readonly target: ContextMenuTarget[K];
}

export interface ContextMenuCommandDef<K extends keyof ContextMenuTarget> {
	/** Displayed verbatim in the context menu, so spaces and capitals are allowed. */
	name: string;
	/** Which right-click surface the entry appears on. */
	target: K;
	nameLocalizations?: LocalizationMap;
	guard?: Guard;
	/** Display filter — pair it with a guard, it is not a security boundary. */
	defaultMemberPermissions?: readonly PermissionBit[];
	guildOnly?: boolean;
	guildIds?: readonly string[];
	/** Whether replies are ephemeral. Defaults to true. */
	ephemeral?: boolean;
	defer?: boolean;
	fallbackError?: LocalizedText;
	handler: (ctx: ContextMenuContext<K>) => Promise<void>;
}

const COMMAND_TYPES = {
	user: ApplicationCommandType.User,
	message: ApplicationCommandType.Message,
} as const;

/**
 * Resolve the clicked target. discord.js exposes it through kind-specific
 * getters, so the narrowing happens once here rather than in every handler.
 *
 * The kind cannot actually mismatch at runtime — Discord routes an interaction
 * to the command it was registered as — but the resolver still asserts it, so a
 * misroute surfaces as a named error instead of an undefined target reaching the
 * handler.
 */
function resolveTarget<K extends keyof ContextMenuTarget>(
	interaction: ContextMenuCommandInteraction,
	kind: K,
): ContextMenuTarget[K] {
	if (kind === "user" && interaction.isUserContextMenuCommand()) {
		return interaction.targetUser as ContextMenuTarget[K];
	}
	if (kind === "message" && interaction.isMessageContextMenuCommand()) {
		return interaction.targetMessage as ContextMenuTarget[K];
	}
	throw new ContextMenuTargetError(interaction.commandName, kind);
}

export function createContextMenuCommand<K extends keyof ContextMenuTarget>(
	def: ContextMenuCommandDef<K>,
): ContextMenuCommand {
	const ephemeral = def.ephemeral ?? true;
	const builder = new ContextMenuCommandBuilder()
		.setName(def.name)
		.setType(COMMAND_TYPES[def.target]);

	if (def.nameLocalizations) {
		builder.setNameLocalizations(def.nameLocalizations);
	}
	if (def.defaultMemberPermissions) {
		builder.setDefaultMemberPermissions(resolvePermissions(def.defaultMemberPermissions));
	}
	if (def.guildOnly) {
		builder.setContexts(InteractionContextType.Guild);
	}

	return {
		data: builder,
		guildIds: def.guildIds,
		dispatch: (interaction, runtime) => dispatch(interaction, def, ephemeral, runtime),
	};
}

async function dispatch<K extends keyof ContextMenuTarget>(
	interaction: ContextMenuCommandInteraction,
	def: ContextMenuCommandDef<K>,
	ephemeral: boolean,
	runtime: CommandRuntime,
): Promise<void> {
	if (!(await passesGuard(interaction, def.guard, runtime))) {
		return;
	}
	const locale = await replyLocale(interaction, runtime);

	try {
		if (def.defer) {
			await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
		}
		await def.handler({
			...createCommandResponders(interaction, locale, ephemeral, runtime),
			interaction,
			target: resolveTarget(interaction, def.target),
		});
	} catch (error) {
		await renderCommandFailure(
			interaction,
			{
				error,
				ephemeral,
				fallbackError: def.fallbackError,
				logMessage: "Context menu handler failed",
			},
			runtime,
		);
	}
}
