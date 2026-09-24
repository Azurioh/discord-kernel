import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { ALL_FIELDS } from "@/modules/demo/commands/config/reset/reset.constant";
import type { ResetOptions } from "@/modules/demo/commands/config/reset/reset.options";
import { confirmOrReportIssues } from "@/modules/demo/commands/config/shared/confirm-or-report-issues.helper";
import { requestContext } from "@/modules/demo/commands/config/shared/request-context.helper";
import { labelOf } from "@/modules/demo/commands/config/shared/setting-key/setting-key.helper";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { demoSettings } from "@/modules/demo/settings/demo.settings";

/**
 * `/config reset`: put one demo setting, or all of them, back to the default.
 *
 * @param settings - resolves the settings service on each use.
 */
export function createResetHandler(
	settings: () => SettingsService,
): (ctx: Context<ResetOptions>) => Promise<void> {
	return async (ctx) => {
		const { key } = ctx.options;
		const request = requestContext(ctx);
		await confirmOrReportIssues(ctx, async () => {
			if (key === ALL_FIELDS) {
				await settings().reset(demoSettings, request.guildId, "all", request);
				return ctx.t(DEMO_MESSAGES.resetAll);
			}
			await settings().reset(demoSettings, request.guildId, [key], request);
			return ctx.t(DEMO_MESSAGES.resetOne, { field: labelOf(key, ctx.t) });
		});
	};
}
