import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { Options } from "@azurioh/discord-kernel/discord/command/options";
import { EMBED_COLORS } from "@azurioh/discord-kernel/discord/ui/colors";
import { appendBoundedFields, buildEmbed } from "@azurioh/discord-kernel/discord/ui/embed";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { requestContext } from "@/modules/demo/commands/config/shared/request-context";
import { DEMO_FIELD_ENTRIES, labelOf } from "@/modules/demo/commands/config/shared/setting-keys";
import { formatSettingValue } from "@/modules/demo/commands/config/show/format-setting-value";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo-messages";
import { demoSettings } from "@/modules/demo/settings/demo-settings";

/**
 * `/config show`: every demo setting in one embed, secrets shown as set or not.
 *
 * @param settings - resolves the settings service on each use.
 */
export function createShowHandler(
	settings: () => SettingsService,
): <O extends Options>(ctx: Context<O>) => Promise<void> {
	return async (ctx) => {
		const { guildId } = requestContext(ctx);
		const values: Readonly<Record<string, unknown>> = await settings().getForSurface(
			demoSettings,
			guildId,
		);
		const embed = buildEmbed(
			ctx.t(demoSettings.labels.title),
			ctx.t(demoSettings.labels.description),
		).setColor(EMBED_COLORS.neutral);
		appendBoundedFields(
			embed,
			DEMO_FIELD_ENTRIES.map(([key, declared]) => ({
				name: `${labelOf(key, ctx.t)} (${key})`,
				value: formatSettingValue({ spec: declared.spec, value: values[key], t: ctx.t }),
			})),
			(count) => ctx.t(DEMO_MESSAGES.hiddenFields, { count }),
		);
		await ctx.reply(embed);
	};
}
