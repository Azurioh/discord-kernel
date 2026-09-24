import {
	type ChatInputCommandInteraction,
	InteractionContextType,
	type LocalizationMap,
	MessageFlags,
	SlashCommandBuilder,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import { resolveRouteOptions, respondWithSuggestions } from "@/discord/command/autocomplete";
import { type Context, createContext, sendEmbed } from "@/discord/command/context";
import type { Guard } from "@/discord/command/guard";
import type { Options, Values } from "@/discord/command/options";
import type { CommandRuntime, SlashCommand } from "@/discord/command/types";
import { CORE_MESSAGES } from "@/discord/i18n";
import { type PermissionBit, resolvePermissions } from "@/discord/permissions";
import { BusinessError } from "@/errors/business-error";
import { createIncidentRef } from "@/errors/incident-ref";
import { type Locale, resolveLocale } from "@/i18n/locale";
import type { LocalizedText } from "@/i18n/translator";

export interface SubcommandDef<O extends Options> {
	description: string;
	/** Translated names, keyed by Discord locale (e.g. `{ fr: "ajouter" }`). */
	nameLocalizations?: LocalizationMap;
	/** Translated descriptions, keyed by Discord locale. */
	descriptionLocalizations?: LocalizationMap;
	options?: O;
	guard?: Guard;
	/** Fallback message shown for unexpected (non-business) errors. */
	fallbackError?: LocalizedText;
	/** Defer the reply before running the handler (for work that may exceed 3s). */
	defer?: boolean;
	/** Whether replies (and the defer) are ephemeral. Defaults to true. */
	ephemeral?: boolean;
	handler: (ctx: Context<O>) => Promise<void>;
}

/**
 * Type-erased subcommand. `createSubCommand()` captures the per-subcommand option
 * generic `O` inside `invoke`, so a single command can hold subcommands with
 * differing option shapes in one record without leaking `any`.
 */
export interface CompiledSubcommand {
	description: string;
	nameLocalizations?: LocalizationMap;
	descriptionLocalizations?: LocalizationMap;
	guard?: Guard;
	fallbackError?: LocalizedText;
	defer: boolean;
	ephemeral: boolean;
	options: Options;
	invoke(ctx: Context<Options>): Promise<void>;
}

export function createSubCommand<O extends Options>(def: SubcommandDef<O>): CompiledSubcommand {
	return {
		description: def.description,
		nameLocalizations: def.nameLocalizations,
		descriptionLocalizations: def.descriptionLocalizations,
		guard: def.guard,
		fallbackError: def.fallbackError,
		defer: def.defer ?? false,
		ephemeral: def.ephemeral ?? true,
		options: def.options ?? {},
		invoke: (ctx) => def.handler(ctx as Context<O>),
	};
}

interface GroupDef {
	description: string;
	nameLocalizations?: LocalizationMap;
	descriptionLocalizations?: LocalizationMap;
	subcommands: Record<string, CompiledSubcommand>;
}

/**
 * A command is either *flat* (a single `handler`, like `/ping`) or *grouped*
 * (`subcommands`/`groups`, like `/notes add`). Provide `handler` for the
 * former; `handler` takes precedence over `subcommands`/`groups` if both are set.
 */
export interface CommandDef<O extends Options = Options> {
	name: string;
	description: string;
	/** Translated names, keyed by Discord locale (e.g. `{ fr: "notes" }`). */
	nameLocalizations?: LocalizationMap;
	/** Translated descriptions, keyed by Discord locale. */
	descriptionLocalizations?: LocalizationMap;
	guard?: Guard;
	/**
	 * Permissions a member must hold for Discord to *show* the command. This is a
	 * display filter, never a security boundary: a server admin can override it in
	 * the Integrations UI, so always pair it with a guard (see `permission-guard.ts`).
	 * Only meaningful on the root command — Discord has no per-subcommand equivalent.
	 */
	defaultMemberPermissions?: readonly PermissionBit[];
	/** Restrict the command to guild contexts (no DM, no user-app install). */
	guildOnly?: boolean;
	/** Restrict deployment to specific guild(s); omit to deploy globally (all servers). */
	guildIds?: readonly string[];
	/** Flat command: typed options for the single handler. */
	options?: O;
	/** Flat command: defer the reply before running the handler. */
	defer?: boolean;
	/** Flat command: whether replies (and the defer) are ephemeral. Defaults to true. */
	ephemeral?: boolean;
	/** Flat command: fallback message for unexpected errors. */
	fallbackError?: LocalizedText;
	/** Flat command: the single handler invoked when the command runs. */
	handler?: (ctx: Context<O>) => Promise<void>;
	/** Grouped command: named subcommands. */
	subcommands?: Record<string, CompiledSubcommand>;
	/** Grouped command: named subcommand groups. */
	groups?: Record<string, GroupDef>;
}

interface SubcommandContainer {
	addSubcommand(
		input: (sub: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder,
	): unknown;
}

/** Resolve the reply locale for an interaction handled outside `createContext`. */
function interactionLocale(
	interaction: ChatInputCommandInteraction,
	runtime: CommandRuntime,
): Locale {
	return resolveLocale(
		[interaction.locale, interaction.guildLocale],
		runtime.translator.defaultLocale,
	);
}

/**
 * The key a subcommand is stored and looked up under. Exported because dispatch
 * and autocomplete must agree on it: if they ever built it differently, an
 * autocomplete inside a group would silently resolve to no options instead of
 * failing loudly.
 */
export function routeKey(group: string | null, name: string): string {
	return group ? `${group}/${name}` : name;
}

/**
 * The root-level settings, split out of {@link CommandDef} so applying them does
 * not drag the option generic `O` along (a `CommandDef<O>` is not assignable to
 * a `CommandDef<Options>` — its handler is contravariant in the options).
 */
interface RootSettings {
	nameLocalizations?: LocalizationMap;
	descriptionLocalizations?: LocalizationMap;
	defaultMemberPermissions?: readonly PermissionBit[];
	guildOnly?: boolean;
}

/**
 * Apply the settings that only exist on the root command: localisations, the
 * visibility filter and the context restriction.
 *
 * `defaultMemberPermissions` is resolved from flags into the single bitfield the
 * API expects. An empty array is meaningful — it means "administrators only" to
 * Discord — so it is passed through rather than skipped.
 */
function applyRootSettings(builder: SlashCommandBuilder, def: RootSettings): void {
	if (def.nameLocalizations) {
		builder.setNameLocalizations(def.nameLocalizations);
	}
	if (def.descriptionLocalizations) {
		builder.setDescriptionLocalizations(def.descriptionLocalizations);
	}
	if (def.defaultMemberPermissions) {
		builder.setDefaultMemberPermissions(resolvePermissions(def.defaultMemberPermissions));
	}
	if (def.guildOnly) {
		builder.setContexts(InteractionContextType.Guild);
	}
}

function applySubcommand(
	container: SubcommandContainer,
	name: string,
	def: CompiledSubcommand,
): void {
	container.addSubcommand((subBuilder) => {
		subBuilder.setName(name).setDescription(def.description);
		if (def.nameLocalizations) {
			subBuilder.setNameLocalizations(def.nameLocalizations);
		}
		if (def.descriptionLocalizations) {
			subBuilder.setDescriptionLocalizations(def.descriptionLocalizations);
		}
		for (const [optionName, option] of Object.entries(def.options)) {
			option.apply(subBuilder, optionName);
		}
		return subBuilder;
	});
}

function readOptions(
	options: Options,
	interaction: ChatInputCommandInteraction,
): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	for (const [name, option] of Object.entries(options)) {
		values[name] = option.read(interaction, name);
	}
	return values;
}

function ephemeralReplyOptions(ephemeral: boolean): { flags?: MessageFlags.Ephemeral } {
	if (ephemeral) {
		return { flags: MessageFlags.Ephemeral };
	}
	return {};
}

/** Run a guard if present; reply with a denial and return `false` when it fails. */
async function passesGuard(
	interaction: ChatInputCommandInteraction,
	guard: Guard | undefined,
	runtime: CommandRuntime,
): Promise<boolean> {
	if (!guard) {
		return true;
	}
	const result = await guard.check(interaction);
	if (!result.ok) {
		const locale = interactionLocale(interaction, runtime);
		await interaction.reply({
			embeds: [
				runtime.presenter.denial(runtime.translator.resolve(locale, result.message), locale),
			],
			flags: MessageFlags.Ephemeral,
		});
		return false;
	}
	return true;
}

/** Read options, optionally defer, build the context and invoke the handler. */
async function executeRoute(
	interaction: ChatInputCommandInteraction,
	route: CompiledSubcommand,
	label: string,
	runtime: CommandRuntime,
): Promise<void> {
	const { presenter, logger, translator } = runtime;
	try {
		const values = readOptions(route.options, interaction);
		if (route.defer) {
			await interaction.deferReply(ephemeralReplyOptions(route.ephemeral));
		}
		const ctx = createContext(
			interaction,
			values as Values<Options>,
			route.ephemeral,
			presenter,
			logger,
			translator,
		);
		await route.invoke(ctx);
	} catch (error) {
		await renderError(interaction, route, label, error, runtime);
	}
}

async function dispatchFlat(
	interaction: ChatInputCommandInteraction,
	root: CompiledSubcommand,
	runtime: CommandRuntime,
): Promise<void> {
	if (!(await passesGuard(interaction, root.guard, runtime))) {
		return;
	}
	await executeRoute(interaction, root, interaction.commandName, runtime);
}

async function dispatchGrouped(
	interaction: ChatInputCommandInteraction,
	routes: Map<string, CompiledSubcommand>,
	commandGuard: Guard | undefined,
	runtime: CommandRuntime,
): Promise<void> {
	const group = interaction.options.getSubcommandGroup(false);
	const name = interaction.options.getSubcommand();
	const label = routeKey(group, name);
	const route = routes.get(label);

	if (!route) {
		const locale = interactionLocale(interaction, runtime);
		await interaction.reply({
			embeds: [
				runtime.presenter.error(
					runtime.translator.translate(locale, CORE_MESSAGES.unknownSubcommand),
					locale,
				),
			],
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (!(await passesGuard(interaction, route.guard ?? commandGuard, runtime))) {
		return;
	}
	await executeRoute(interaction, route, label, runtime);
}

async function renderError(
	interaction: ChatInputCommandInteraction,
	route: CompiledSubcommand,
	label: string,
	error: unknown,
	runtime: CommandRuntime,
): Promise<void> {
	const { presenter, logger, translator } = runtime;
	const locale = interactionLocale(interaction, runtime);
	if (error instanceof BusinessError) {
		const text = error.translation
			? translator.translate(locale, error.translation.key, error.translation.params)
			: error.message;
		const embed =
			error.severity === "warning"
				? presenter.warning(text, locale)
				: presenter.error(text, locale);
		await sendEmbed(interaction, embed, route.ephemeral, logger);
		return;
	}

	const ref = createIncidentRef();
	logger.error(
		{
			command: interaction.commandName,
			subcommand: label,
			userId: interaction.user.id,
			ref,
			err: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		},
		"Command handler failed",
	);
	await sendEmbed(
		interaction,
		presenter.systemError(
			translator.resolve(locale, route.fallbackError ?? { key: CORE_MESSAGES.genericError }),
			ref,
			locale,
		),
		route.ephemeral,
		logger,
	);
}

/**
 * Build a {@link SlashCommand} from a declarative definition: it produces the
 * discord.js builder *and* the routing/guard/error pipeline. The runtime
 * (presenter, logger) is injected per-dispatch by the command router.
 */
export function createCommand<O extends Options = Options>(def: CommandDef<O>): SlashCommand {
	const builder = new SlashCommandBuilder().setName(def.name).setDescription(def.description);

	// Configured before the flat/grouped branching below: both return paths share
	// this builder, so root-level settings must not be duplicated per branch.
	applyRootSettings(builder, def);

	if (def.handler) {
		const handler = def.handler;
		const root: CompiledSubcommand = {
			description: def.description,
			guard: def.guard,
			fallbackError: def.fallbackError,
			defer: def.defer ?? false,
			ephemeral: def.ephemeral ?? true,
			options: def.options ?? {},
			invoke: (ctx) => handler(ctx as Context<O>),
		};
		for (const [optionName, option] of Object.entries(root.options)) {
			option.apply(builder, optionName);
		}
		return {
			data: builder,
			guildIds: def.guildIds,
			dispatch: (interaction, runtime) => dispatchFlat(interaction, root, runtime),
			autocomplete: hasAutocomplete(root.options)
				? (interaction) => respondWithSuggestions(interaction, root.options)
				: undefined,
		};
	}

	const routes = new Map<string, CompiledSubcommand>();

	if (def.subcommands) {
		for (const [name, subDef] of Object.entries(def.subcommands)) {
			applySubcommand(builder, name, subDef);
			routes.set(name, subDef);
		}
	}

	if (def.groups) {
		for (const [groupName, group] of Object.entries(def.groups)) {
			builder.addSubcommandGroup((groupBuilder) => {
				groupBuilder.setName(groupName).setDescription(group.description);
				if (group.nameLocalizations) {
					groupBuilder.setNameLocalizations(group.nameLocalizations);
				}
				if (group.descriptionLocalizations) {
					groupBuilder.setDescriptionLocalizations(group.descriptionLocalizations);
				}
				for (const [name, subDef] of Object.entries(group.subcommands)) {
					applySubcommand(groupBuilder, name, subDef);
				}
				return groupBuilder;
			});
			for (const [name, subDef] of Object.entries(group.subcommands)) {
				routes.set(routeKey(groupName, name), subDef);
			}
		}
	}

	return {
		data: builder,
		guildIds: def.guildIds,
		dispatch: (interaction, runtime) => dispatchGrouped(interaction, routes, def.guard, runtime),
		autocomplete: [...routes.values()].some((route) => hasAutocomplete(route.options))
			? (interaction) =>
					respondWithSuggestions(interaction, resolveRouteOptions(interaction, routes, null))
			: undefined,
	};
}

/** Whether any option of a route declares a resolver, so the seam stays absent otherwise. */
function hasAutocomplete(options: Options): boolean {
	return Object.values(options).some((option) => option.autocomplete !== undefined);
}
