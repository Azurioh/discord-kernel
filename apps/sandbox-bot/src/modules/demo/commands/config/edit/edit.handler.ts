import { systemClock } from "@azurioh/discord-kernel/clock";
import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { Options } from "@azurioh/discord-kernel/discord/command/options";
import {
	editorComponentIds,
	mountSettingsEditor,
	settingsEditorFromDeclaration,
} from "@azurioh/discord-kernel/discord/components/settings-editor";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import type { Logger } from "@azurioh/discord-kernel/logger";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { editChrome } from "@/modules/demo/commands/config/edit/edit.helper";
import { requestContext } from "@/modules/demo/commands/config/shared/request-context.helper";
import { demoSettings } from "@/modules/demo/settings/demo.settings";

/** Prefix of the screen's custom ids. */
const EDITOR_ID_PREFIX = "demo-config";

export interface EditHandlerDeps {
	readonly settings: () => SettingsService;
	readonly translator: Translator;
	readonly logger: Logger;
}

/**
 * `/config edit`: mount the screen generated from `demoSettings`. Every write
 * goes through the settings service, as `/config set` does.
 *
 * @param deps - the settings service, the translator and the logger.
 */
export function createEditHandler(
	deps: EditHandlerDeps,
): <O extends Options>(ctx: Context<O>) => Promise<void> {
	return async (ctx) => {
		const { guildId, userId } = requestContext(ctx);
		const { locale } = ctx;
		const adapted = await settingsEditorFromDeclaration(demoSettings, deps.settings(), {
			guildId,
			userId,
			locale,
			translator: deps.translator,
		});
		await mountSettingsEditor(ctx.interaction, {
			...adapted,
			ids: editorComponentIds(EDITOR_ID_PREFIX),
			chrome: editChrome(ctx.t),
			translator: deps.translator,
			locale,
			clock: systemClock,
			logger: deps.logger,
		});
	};
}
