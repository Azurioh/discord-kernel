import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { Options } from "@azurioh/discord-kernel/discord/command/options";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { confirmOrReportIssues } from "@/modules/demo/config/confirm-or-report-issues";
import { requestContext } from "@/modules/demo/config/request-context";
import { ALL_FIELDS, labelOf } from "@/modules/demo/config/setting-keys";
import { DEMO_MESSAGES } from "@/modules/demo/demo-catalog";
import { demoSettings } from "@/modules/demo/demo-settings";

/** What `/config reset` was given. */
export interface ResetInput {
	/** A declared key, or {@link ALL_FIELDS}. */
	readonly key: string;
}

/**
 * `/config reset`: put one demo setting, or all of them, back to the default.
 *
 * @param settings - resolves the settings service on each use.
 */
export function createResetHandler(
	settings: () => SettingsService,
): <O extends Options>(ctx: Context<O>, input: ResetInput) => Promise<void> {
	return async (ctx, { key }) => {
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
