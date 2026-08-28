import {
	ApplicationCommandType,
	ContextMenuCommandBuilder,
	type ContextMenuCommandInteraction,
	type EmbedBuilder,
	InteractionContextType,
	type LocalizationMap,
	type Message,
	MessageFlags,
	type User,
} from "discord.js";
import { ContextMenuTargetError } from "@/discord/command/errors";
import type { Guard } from "@/discord/command/guard";
import type { CommandRuntime, ContextMenuCommand } from "@/discord/command/types";
import { CORE_MESSAGES } from "@/discord/i18n";
import { type PermissionBit, resolvePermissions } from "@/discord/permissions";
import { BusinessError, createIncidentRef } from "@/errors";
import { type Locale, type LocalizedText, resolveLocale, type TranslationParams } from "@/i18n";
import type { Logger } from "@/logger";

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

export interface ContextMenuContext<K extends keyof ContextMenuTarget> {
	readonly interaction: ContextMenuCommandInteraction;
	/** The right-clicked member or message. */
	readonly target: ContextMenuTarget[K];
	/** Reply language: user's client locale → guild locale → configured default. */
	readonly locale: Locale;
	/** Translate a catalog key for this interaction's locale. */
	t(key: string, params?: TranslationParams): string;
	confirm(message: string): Promise<void>;
	error(message: string): Promise<void>;
	deny(message: string): Promise<void>;
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
	const { presenter, logger, translator } = runtime;
	const locale = resolveLocale(
		[interaction.locale, interaction.guildLocale],
		translator.defaultLocale,
	);

	if (def.guard) {
		const result = await def.guard.check(interaction);
		if (!result.ok) {
			await interaction.reply({
				embeds: [presenter.denial(translator.resolve(locale, result.message), locale)],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
	}

	try {
		if (def.defer) {
			await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
		}
		await def.handler({
			interaction,
			target: resolveTarget(interaction, def.target),
			locale,
			t: (key, params) => translator.translate(locale, key, params),
			confirm: (message) =>
				send(interaction, presenter.confirmation(message, locale), ephemeral, logger),
			error: (message) => send(interaction, presenter.error(message, locale), ephemeral, logger),
			deny: (message) => send(interaction, presenter.denial(message, locale), ephemeral, logger),
		});
	} catch (error) {
		if (error instanceof BusinessError) {
			const text = error.translation
				? translator.translate(locale, error.translation.key, error.translation.params)
				: error.message;
			const embed =
				error.severity === "warning"
					? presenter.warning(text, locale)
					: presenter.error(text, locale);
			await send(interaction, embed, ephemeral, logger);
			return;
		}
		const ref = createIncidentRef();
		logger.error(
			{
				command: interaction.commandName,
				userId: interaction.user.id,
				ref,
				err: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			},
			"Context menu handler failed",
		);
		await send(
			interaction,
			presenter.systemError(
				translator.resolve(locale, def.fallbackError ?? { key: CORE_MESSAGES.genericError }),
				ref,
				locale,
			),
			ephemeral,
			logger,
		);
	}
}

/**
 * Deliver an embed whatever the interaction's lifecycle state, and never throw:
 * a failed delivery (e.g. an expired interaction) must not escape into the
 * client's unhandled `error` event. Mirrors the command pipeline's `sendEmbed`,
 * which is typed for chat-input interactions only.
 */
async function send(
	interaction: ContextMenuCommandInteraction,
	embed: EmbedBuilder,
	ephemeral: boolean,
	logger: Logger,
): Promise<void> {
	const flags = ephemeral ? MessageFlags.Ephemeral : undefined;
	try {
		if (interaction.deferred) {
			await interaction.editReply({ embeds: [embed] });
			return;
		}
		if (interaction.replied) {
			await interaction.followUp({ embeds: [embed], flags });
			return;
		}
		await interaction.reply({ embeds: [embed], flags });
	} catch (error) {
		logger.error(
			{
				commandName: interaction.commandName,
				interactionId: interaction.id,
				err: error instanceof Error ? error.message : String(error),
			},
			"Failed to deliver interaction response",
		);
	}
}
