import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { Options } from "@azurioh/discord-kernel/discord/command/options";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import type { Logger } from "@azurioh/discord-kernel/logger";
import type { SettingsService } from "@azurioh/discord-kernel/settings";
import { showSettingsScreen } from "@/components/settings-screen/settings-screen.component";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo.messages";
import { demoSettings } from "@/modules/demo/settings/demo.settings";

/** Prefix of the screen's custom ids. */
const EDITOR_ID_PREFIX = "demo-config";

export interface EditHandlerDeps {
	readonly settings: () => SettingsService;
	readonly translator: Translator;
	readonly logger: Logger;
}

/**
 * `/config edit`: show the app's settings screen over `demoSettings`. Every
 * write goes through the settings service, as `/config set` does.
 *
 * @param deps - the settings service, the translator and the logger.
 */
export function createEditHandler(
	deps: EditHandlerDeps,
): <O extends Options>(ctx: Context<O>) => Promise<void> {
	return async (ctx) => {
		await showSettingsScreen(ctx, {
			declaration: demoSettings,
			settings: deps.settings(),
			translator: deps.translator,
			logger: deps.logger,
			idPrefix: EDITOR_ID_PREFIX,
			introKey: DEMO_MESSAGES.editIntro,
		});
	};
}
