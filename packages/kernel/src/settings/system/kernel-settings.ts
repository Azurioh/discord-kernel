import { type Locale, SUPPORTED_LOCALES } from "@/i18n/locale";
import { defineSettings } from "@/settings/define-settings";
import { field } from "@/settings/fields/builders";
import { KERNEL_SETTINGS_MESSAGES } from "@/settings/messages";

/** Id of the kernel's own settings declaration. */
export const KERNEL_SETTINGS_ID = "kernel";

/**
 * What the kernel declaration needs to know of a module. A `BotModule`
 * satisfies it as is, so the composition root passes its modules unchanged.
 */
export interface ModuleEnablement {
	readonly name: string;
	/** Whether the module starts enabled in a guild that never toggled it. Defaults to `true`. */
	readonly defaultEnabled?: boolean;
}

const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
	en: KERNEL_SETTINGS_MESSAGES.localeEn,
	fr: KERNEL_SETTINGS_MESSAGES.localeFr,
};

/**
 * The kernel's own settings, declared like any module's (FR-039): which
 * modules are enabled on the guild, and the bot's language there.
 *
 * A factory rather than a constant because the module names are only known at
 * composition: `createSettingsRegistry` calls it with the modules it receives.
 *
 * @param modules - the registered modules, in registration order.
 * @returns the declaration of id {@link KERNEL_SETTINGS_ID}.
 * @throws SettingsDeclarationError when two modules share a name.
 */
export function kernelSettings(modules: readonly ModuleEnablement[]) {
	return defineSettings({
		id: KERNEL_SETTINGS_ID,
		version: 1,
		labels: {
			title: KERNEL_SETTINGS_MESSAGES.title,
			description: KERNEL_SETTINGS_MESSAGES.description,
		},
		fields: {
			modules: field.toggles<string>({
				label: KERNEL_SETTINGS_MESSAGES.modules,
				description: KERNEL_SETTINGS_MESSAGES.modulesDescription,
				keys: modules.map(({ name }) => name),
				default: Object.fromEntries(
					modules.map(({ name, defaultEnabled }) => [name, defaultEnabled ?? true]),
				),
			}),
			locale: field.enum({
				label: KERNEL_SETTINGS_MESSAGES.locale,
				description: KERNEL_SETTINGS_MESSAGES.localeDescription,
				choices: SUPPORTED_LOCALES.map((locale) => ({
					value: locale,
					label: LOCALE_LABELS[locale],
				})),
			}),
		},
	});
}

/** The kernel's settings declaration, as built by {@link kernelSettings}. */
export type KernelSettings = ReturnType<typeof kernelSettings>;
