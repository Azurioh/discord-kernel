import { type BaseInteraction, PermissionFlagsBits } from "discord.js";
import type { Guard, GuardResult } from "@/discord/command/guard";
import { CORE_MESSAGES } from "@/discord/i18n";
import { replyLocale } from "@/discord/interaction/reply-locale";
import type { SettingsDeclaration } from "@/settings/define-settings";
import { SETTINGS_MESSAGES } from "@/settings/messages";
import type { SettingsService } from "@/settings/settings-service";

const ALLOW: GuardResult = { ok: true };

const NOT_CONFIGURED: GuardResult = {
	ok: false,
	message: { key: SETTINGS_MESSAGES.moduleNotConfigured },
};

/**
 * Block a command or a component until its module is configured on the guild
 * (FR-041): until `service.status` lists no missing field, the member gets the
 * translated "not configured" message instead of the handler.
 *
 * - Members allowed to configure the bot (the `ManageGuild` permission, until
 *   the permissions feature exists) also read which settings are missing, by
 *   their translated labels, in the reply language (the pipeline's
 *   `LocaleResolver`). Other members never see them.
 * - The status is read through the service's cache, which every write
 *   invalidates: the guard passes as soon as the value is set, no restart.
 * - Outside a guild there is nothing to configure for: denied like
 *   `guildOnlyGuard`, without reading any setting.
 *
 * Typed over `BaseInteraction`, so the same guard is a command's `guard` and a
 * component handler's `guard`.
 *
 * @param declaration - the module's settings declaration.
 * @param service - reads the guild's configuration status.
 */
export function requireConfigured(
	declaration: SettingsDeclaration,
	service: SettingsService,
): Guard<BaseInteraction> {
	return {
		async check(interaction, runtime) {
			if (!interaction.guildId) {
				return { ok: false, message: { key: CORE_MESSAGES.guardGuildOnly } };
			}
			const { missing } = await service.status(declaration, interaction.guildId);
			if (missing.length === 0) {
				return ALLOW;
			}
			const canConfigure =
				interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
			if (!canConfigure || runtime === undefined) {
				return NOT_CONFIGURED;
			}
			const { translator } = runtime;
			const locale = await replyLocale(interaction, runtime);
			const fields = missing
				.map((key) => translator.translate(locale, declaration.fields[key]?.label ?? key))
				.join(", ");
			return {
				ok: false,
				message: [
					translator.translate(locale, SETTINGS_MESSAGES.moduleNotConfigured),
					translator.translate(locale, SETTINGS_MESSAGES.moduleNotConfiguredMissing, { fields }),
				].join(" "),
			};
		},
	};
}
