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
import type { SettingsDeclaration, SettingsService } from "@azurioh/discord-kernel/settings";
import { settingsScreenChrome } from "@/components/settings-screen/settings-screen.view";
import { requestContext } from "@/shared/discord/request-context";

export interface SettingsScreenProps {
	/** The declaration the screen is generated from. */
	readonly declaration: SettingsDeclaration;
	/** Reads and writes the values, as every other settings surface does. */
	readonly settings: SettingsService;
	/** Translates the screen's texts. */
	readonly translator: Translator;
	/** Receives the screen's failures. */
	readonly logger: Logger;
	/** Prefix of the screen's custom ids, unique per screen. */
	readonly idPrefix: string;
	/** Catalog key of the line shown above the settings. */
	readonly introKey: string;
}

/**
 * The app's settings screen: the kernel's editor generated from a
 * declaration, framed by the app's chrome. Every write goes through the
 * settings service as the member who opened it.
 *
 * Call it on an already-deferred interaction, in a guild.
 *
 * @param ctx - the command being answered; gives the guild, the member and their language.
 * @param props - which declaration to edit, and through what.
 */
export async function showSettingsScreen<O extends Options>(
	ctx: Context<O>,
	props: SettingsScreenProps,
): Promise<void> {
	const { guildId, userId } = requestContext(ctx);
	const { locale } = ctx;
	const adapted = await settingsEditorFromDeclaration(props.declaration, props.settings, {
		guildId,
		userId,
		locale,
		translator: props.translator,
	});
	await mountSettingsEditor(ctx.interaction, {
		...adapted,
		ids: editorComponentIds(props.idPrefix),
		chrome: settingsScreenChrome(props.declaration.labels.title, ctx.t(props.introKey)),
		translator: props.translator,
		locale,
		clock: systemClock,
		logger: props.logger,
	});
}
