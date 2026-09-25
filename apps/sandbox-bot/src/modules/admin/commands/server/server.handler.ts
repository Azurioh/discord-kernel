import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { Options } from "@azurioh/discord-kernel/discord/command/options";
import type { Translator } from "@azurioh/discord-kernel/i18n/translator";
import type { Logger } from "@azurioh/discord-kernel/logger";
import type { KernelSettings, SettingsService } from "@azurioh/discord-kernel/settings";
import { showSettingsScreen } from "@/components/settings-screen/settings-screen.component";
import { ADMIN_MESSAGES } from "@/modules/admin/i18n/admin.messages";

/** Prefix of the screen's custom ids. */
const SERVER_SCREEN_ID_PREFIX = "admin-server";

export interface ServerHandlerDeps {
	readonly settings: () => SettingsService;
	readonly kernelSettings: () => KernelSettings;
	readonly translator: Translator;
	readonly logger: Logger;
}

/**
 * `/server`: show the app's settings screen over the kernel's own
 * declaration, where the modules are toggled and the language is picked.
 *
 * @param deps - the settings service, the kernel declaration, the translator and the logger.
 */
export function createServerHandler(
	deps: ServerHandlerDeps,
): <O extends Options>(ctx: Context<O>) => Promise<void> {
	return async (ctx) => {
		await showSettingsScreen(ctx, {
			declaration: deps.kernelSettings(),
			settings: deps.settings(),
			translator: deps.translator,
			logger: deps.logger,
			idPrefix: SERVER_SCREEN_ID_PREFIX,
			introKey: ADMIN_MESSAGES.serverIntro,
		});
	};
}
