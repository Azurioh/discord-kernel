import { frenchLocalization } from "@azurioh/discord-kernel/discord/command/localization";
import type { LocalizationMap } from "discord.js";
import type { ModuleCatalog } from "@/shared/i18n/module-catalog";

/** A command, subcommand or option description, English first, French when the catalog has it. */
export interface LocalizedDescription {
	readonly description: string;
	readonly descriptionLocalizations?: LocalizationMap;
}

/**
 * Read a description from a module catalog: Discord registers it once, so it
 * is taken from the catalog entry rather than translated per interaction.
 *
 * @param catalog - the module catalog that holds the entry.
 * @param key - the entry's key, from the module's `*_MESSAGES` constant.
 */
export function localizedDescription<K extends string>(
	catalog: ModuleCatalog<K>,
	key: K,
): LocalizedDescription {
	const { en, fr } = catalog[key];
	return fr === undefined
		? { description: en }
		: { description: en, descriptionLocalizations: frenchLocalization(fr) };
}
