import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { Options } from "@azurioh/discord-kernel/discord/command/options";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { confirmOrReportIssues } from "@/modules/demo/config/confirm-or-report-issues";
import { parseValueInput } from "@/modules/demo/config/parse-value-input";
import { requestContext } from "@/modules/demo/config/request-context";
import { labelOf } from "@/modules/demo/config/setting-keys";
import { DEMO_MESSAGES } from "@/modules/demo/demo-catalog";
import { demoSettings } from "@/modules/demo/demo-settings";

/** What `/config set` was given. */
export interface SetInput {
	readonly key: string;
	/** JSON when it parses, plain text otherwise. */
	readonly value: string;
}

/**
 * `/config set`: write one demo setting and confirm with its new revision.
 *
 * @param settings - resolves the settings service on each use.
 */
export function createSetHandler(
	settings: () => SettingsService,
): <O extends Options>(ctx: Context<O>, input: SetInput) => Promise<void> {
	return async (ctx, { key, value }) => {
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
