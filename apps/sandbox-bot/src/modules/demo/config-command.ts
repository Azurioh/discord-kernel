import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import {
	createCommand,
	createSubCommand,
} from "@azurioh/discord-kernel/discord/command/create-command";
import { allOf } from "@azurioh/discord-kernel/discord/command/guard";
import { frenchLocalization } from "@azurioh/discord-kernel/discord/command/localization";
import {
	type AutocompleteResolver,
	createStringOption,
	type Options,
} from "@azurioh/discord-kernel/discord/command/options";
import {
	createPermissionGuard,
	guildOnlyGuard,
} from "@azurioh/discord-kernel/discord/command/permission-guard";
import type { SlashCommand } from "@azurioh/discord-kernel/discord/command/types";
import { CORE_MESSAGES } from "@azurioh/discord-kernel/discord/i18n";
import { EMBED_COLORS } from "@azurioh/discord-kernel/discord/ui/colors";
import { appendBoundedFields, buildEmbed } from "@azurioh/discord-kernel/discord/ui/embed";
import { ValidationError } from "@azurioh/discord-kernel/errors/business-error";
import { resolveLocale } from "@azurioh/discord-kernel/i18n/locale";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import {
	type RequestContext,
	type SettingsService,
	SettingsValidationError,
} from "@azurioh/discord-kernel/settings";
import { PermissionFlagsBits } from "discord.js";
import { DEMO_MESSAGES } from "@/modules/demo/demo-catalog";
import { demoSettings } from "@/modules/demo/demo-settings";
import { formatSettingValue, parseValueInput } from "@/modules/demo/setting-text";

/** The `/config reset` key that clears every field at once. */
const ALL_FIELDS = "all";

export interface ConfigCommandDeps {
	readonly guildIds: readonly string[];
	/** Resolved on each use: the service is built after the modules declared their settings. */
	readonly settings: () => SettingsService;
	readonly translator: Translator;
}

const fieldEntries = Object.entries(demoSettings.fields);

/** Catalog key of each field's label; `defineSettings` guarantees one per field. */
const LABEL_BY_KEY: ReadonlyMap<string, string> = new Map(
	fieldEntries.flatMap(([key, declared]) => (declared.label ? [[key, declared.label]] : [])),
);

/** The translated label of a declared key, or the key itself when it is not declared. */
function labelOf(key: string, t: (key: string) => string): string {
	const label = LABEL_BY_KEY.get(key);
	return label === undefined ? key : t(label);
}

/**
 * Who asks, where and in which language, for the settings service.
 *
 * @throws ValidationError outside a guild; the guild-only guard runs first, so
 * this only holds the type system to what the guard already enforced.
 */
function requestContext<O extends Options>(ctx: Context<O>): RequestContext {
	const { guildId, user } = ctx.interaction;
	if (guildId === null) {
		throw new ValidationError("/config needs a guild", { key: CORE_MESSAGES.guardGuildOnly });
	}
	return { guildId, userId: user.id, locale: ctx.locale };
}

/** Suggest the declared keys whose key or translated label starts with what was typed. */
function keyResolver(translator: Translator, withAll: boolean): AutocompleteResolver {
	return (interaction) => {
		const locale = resolveLocale(
			[interaction.locale, interaction.guildLocale],
			translator.defaultLocale,
		);
		const t = (key: string) => translator.translate(locale, key);
		const typed = interaction.options.getFocused().toLowerCase();
		const choices = fieldEntries.map(([key]) => ({
			name: `${labelOf(key, t)} (${key})`,
			value: key,
		}));
		if (withAll) {
			choices.push({ name: t(DEMO_MESSAGES.allFields), value: ALL_FIELDS });
		}
		return choices.filter(
			(choice) =>
				choice.value.toLowerCase().startsWith(typed) || choice.name.toLowerCase().startsWith(typed),
		);
	};
}

/** Show a rejected submission: every issue, each in the administrator's language. */
async function replyWithIssues<O extends Options>(
	ctx: Context<O>,
	error: SettingsValidationError,
): Promise<void> {
	const issues = error.issues
		.map(
			(issue) => `• \`${issue.field}\`: ${ctx.t(issue.translation.key, issue.translation.params)}`,
		)
		.join("\n");
	await ctx.error(ctx.t(DEMO_MESSAGES.rejected, { issues }));
}

/**
 * Run a settings write and confirm with the text it returns. A rejected
 * submission is answered with its issues instead; any other failure goes on
 * to the command pipeline.
 */
async function confirmOrReportIssues<O extends Options>(
	ctx: Context<O>,
	write: () => Promise<string>,
): Promise<void> {
	let confirmation: string;
	try {
		confirmation = await write();
	} catch (error) {
		if (error instanceof SettingsValidationError) {
			await replyWithIssues(ctx, error);
			return;
		}
		throw error;
	}
	await ctx.confirm(confirmation);
}

/**
 * `/config show|set|reset` over the demo module's settings: a text surface on
 * the settings service, gated to members who can manage the server.
 */
export function createConfigCommand(deps: ConfigCommandDeps): SlashCommand {
	const { translator } = deps;

	return createCommand({
		name: "config",
		description: "Read and change the demo settings",
		descriptionLocalizations: frenchLocalization("Lire et modifier les paramètres de la démo"),
		guildIds: deps.guildIds,
		guildOnly: true,
		defaultMemberPermissions: [PermissionFlagsBits.ManageGuild],
		guard: allOf(guildOnlyGuard, createPermissionGuard([PermissionFlagsBits.ManageGuild])),
		subcommands: {
			show: createSubCommand({
				description: "Show every demo setting",
				descriptionLocalizations: frenchLocalization("Afficher tous les paramètres de la démo"),
				handler: async (ctx) => {
					const { guildId } = requestContext(ctx);
					const values: Readonly<Record<string, unknown>> = await deps
						.settings()
						.getForSurface(demoSettings, guildId);
					const embed = buildEmbed(
						ctx.t(demoSettings.labels.title),
						ctx.t(demoSettings.labels.description),
					).setColor(EMBED_COLORS.neutral);
					appendBoundedFields(
						embed,
						fieldEntries.map(([key, declared]) => ({
							name: `${labelOf(key, ctx.t)} (${key})`,
							value: formatSettingValue({ spec: declared.spec, value: values[key], t: ctx.t }),
						})),
						(count) => ctx.t(DEMO_MESSAGES.hiddenFields, { count }),
					);
					await ctx.reply(embed);
				},
			}),
			set: createSubCommand({
				description: "Change one demo setting",
				descriptionLocalizations: frenchLocalization("Modifier un paramètre de la démo"),
				options: {
					key: createStringOption(
						"The setting to change",
						{},
						{
							descriptionLocalizations: frenchLocalization("Le paramètre à modifier"),
						},
					)
						.required()
						.withAutocomplete(keyResolver(translator, false)),
					value: createStringOption(
						"The new value: JSON, or plain text",
						{},
						{
							descriptionLocalizations: frenchLocalization(
								"La nouvelle valeur : du JSON, ou du texte brut",
							),
						},
					).required(),
				},
				handler: async (ctx) => {
					const { key, value } = ctx.options;
					const request = requestContext(ctx);
					await confirmOrReportIssues(ctx, async () => {
						const written = await deps
							.settings()
							.set(demoSettings, request.guildId, { [key]: parseValueInput(value) }, request);
						return ctx.t(DEMO_MESSAGES.saved, {
							field: labelOf(key, ctx.t),
							revision: written.revision,
						});
					});
				},
			}),
			reset: createSubCommand({
				description: "Put one demo setting, or all of them, back to the default",
				descriptionLocalizations: frenchLocalization(
					"Remettre un paramètre de la démo, ou tous, à la valeur par défaut",
				),
				options: {
					key: createStringOption(
						"The setting to reset, or all",
						{},
						{
							descriptionLocalizations: frenchLocalization("Le paramètre à réinitialiser, ou tous"),
						},
					)
						.required()
						.withAutocomplete(keyResolver(translator, true)),
				},
				handler: async (ctx) => {
					const { key } = ctx.options;
					const request = requestContext(ctx);
					await confirmOrReportIssues(ctx, async () => {
						if (key === ALL_FIELDS) {
							await deps.settings().reset(demoSettings, request.guildId, "all", request);
							return ctx.t(DEMO_MESSAGES.resetAll);
						}
						await deps.settings().reset(demoSettings, request.guildId, [key], request);
						return ctx.t(DEMO_MESSAGES.resetOne, { field: labelOf(key, ctx.t) });
					});
				},
			}),
		},
	});
}
