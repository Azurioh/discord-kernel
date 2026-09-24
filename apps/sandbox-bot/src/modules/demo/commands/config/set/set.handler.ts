import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { parseValueInput } from "@/modules/demo/commands/config/set/set.helper";
import type { SetOptions } from "@/modules/demo/commands/config/set/set.options";
import { confirmOrReportIssues } from "@/modules/demo/commands/config/shared/confirm-or-report-issues.helper";
import { requestContext } from "@/modules/demo/commands/config/shared/request-context.helper";
import { labelOf } from "@/modules/demo/commands/config/shared/setting-key/setting-key.helper";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { demoSettings } from "@/modules/demo/settings/demo.settings";

/**
 * `/config set`: write one demo setting and confirm with its new revision.
 *
 * @param settings - resolves the settings service on each use.
 */
export function createSetHandler(
	settings: () => SettingsService,
): (ctx: Context<SetOptions>) => Promise<void> {
	return async (ctx) => {
		const { key, value } = ctx.options;
		const request = requestContext(ctx);
		await confirmOrReportIssues(ctx, async () => {
			const written = await settings().set(
				demoSettings,
				request.guildId,
				{ [key]: parseValueInput(value) },
				request,
			);
			return ctx.t(DEMO_MESSAGES.saved, { field: labelOf(key, ctx.t), revision: written.revision });
		});
	};
}
