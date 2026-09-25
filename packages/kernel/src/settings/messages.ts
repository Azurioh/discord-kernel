import type { KeyedCatalog, MessageKey } from "@/i18n/catalog";
import type { SettingsIssueCode } from "@/settings/settings-validation-error";

/**
 * Catalog key of each validation issue. Typed over every {@link SettingsIssueCode}
 * so adding a code without its wording fails to compile.
 *
 * Placeholders: `min` / `minLength` / `minItems` take `{min}`, `max` /
 * `maxLength` / `maxItems` take `{max}`; the others take none.
 */
export const SETTINGS_ISSUE_MESSAGES = {
	required: "core.settings.issue.required",
	type: "core.settings.issue.type",
	min: "core.settings.issue.min",
	max: "core.settings.issue.max",
	minLength: "core.settings.issue.min-length",
	maxLength: "core.settings.issue.max-length",
	minItems: "core.settings.issue.min-items",
	maxItems: "core.settings.issue.max-items",
	duplicate: "core.settings.issue.duplicate",
	channelType: "core.settings.issue.channel-type",
	notFound: "core.settings.issue.not-found",
	unknownChoice: "core.settings.issue.unknown-choice",
	unknownField: "core.settings.issue.unknown-field",
} as const satisfies Readonly<Record<SettingsIssueCode, string>>;

/** Catalog keys for the settings feature's own wording outside validation. */
export const SETTINGS_MESSAGES = {
	/** Shown instead of a secret's value, which no surface ever reads back. */
	secretSet: "core.settings.secret.set",
	secretNotSet: "core.settings.secret.not-set",
	/** Shown for a stored channel, role or member the guild no longer has. */
	valueUnavailable: "core.settings.value.unavailable",
	/** Shown for a setting that holds no value. */
	valueNotSet: "core.settings.value.not-set",
	/** Shown for a toggles setting with none of its toggles on. */
	valueNone: "core.settings.value.none",
	/** The two options a yes/no setting is picked from. */
	booleanTrue: "core.settings.boolean.true",
	booleanFalse: "core.settings.boolean.false",
	/** Reply when a module disabled on the guild is used there. */
	moduleDisabled: "core.settings.module.disabled",
	/** Reply when a module still lacks a required setting. */
	moduleNotConfigured: "core.settings.module.not-configured",
	/** The missing settings, listed only to members who can fix them. */
	moduleNotConfiguredMissing: "core.settings.module.not-configured-missing",
} as const;

/** Catalog keys of the kernel's own settings declaration (`kernelSettings`). */
export const KERNEL_SETTINGS_MESSAGES = {
	title: "core.settings.kernel.title",
	description: "core.settings.kernel.description",
	modules: "core.settings.kernel.modules",
	modulesDescription: "core.settings.kernel.modules-description",
	locale: "core.settings.kernel.locale",
	localeDescription: "core.settings.kernel.locale-description",
	localeEn: "core.settings.kernel.locale-en",
	localeFr: "core.settings.kernel.locale-fr",
} as const;

/**
 * The settings feature's strings, registered by the composition root alongside
 * the core catalog.
 */
export const SETTINGS_CATALOG: KeyedCatalog<
	| MessageKey<typeof SETTINGS_ISSUE_MESSAGES>
	| MessageKey<typeof SETTINGS_MESSAGES>
	| MessageKey<typeof KERNEL_SETTINGS_MESSAGES>
> = {
	[SETTINGS_ISSUE_MESSAGES.required]: {
		en: "This setting is required.",
		fr: "Ce paramètre est obligatoire.",
	},
	[SETTINGS_ISSUE_MESSAGES.type]: {
		en: "This value is not of the expected kind.",
		fr: "Cette valeur n'est pas du type attendu.",
	},
	[SETTINGS_ISSUE_MESSAGES.min]: {
		en: "Must be at least {min}.",
		fr: "Doit être au moins {min}.",
	},
	[SETTINGS_ISSUE_MESSAGES.max]: {
		en: "Must be at most {max}.",
		fr: "Doit être au plus {max}.",
	},
	[SETTINGS_ISSUE_MESSAGES.minLength]: {
		en: "Must be at least {min} characters long.",
		fr: "Doit contenir au moins {min} caractères.",
	},
	[SETTINGS_ISSUE_MESSAGES.maxLength]: {
		en: "Must be at most {max} characters long.",
		fr: "Doit contenir au plus {max} caractères.",
	},
	[SETTINGS_ISSUE_MESSAGES.minItems]: {
		en: "Pick at least {min} items.",
		fr: "Choisissez au moins {min} éléments.",
	},
	[SETTINGS_ISSUE_MESSAGES.maxItems]: {
		en: "Pick at most {max} items.",
		fr: "Choisissez au plus {max} éléments.",
	},
	[SETTINGS_ISSUE_MESSAGES.duplicate]: {
		en: "The same value is listed more than once.",
		fr: "La même valeur apparaît plusieurs fois.",
	},
	[SETTINGS_ISSUE_MESSAGES.channelType]: {
		en: "This type of channel is not allowed here.",
		fr: "Ce type de salon n'est pas autorisé ici.",
	},
	[SETTINGS_ISSUE_MESSAGES.notFound]: {
		en: "This no longer exists on this server.",
		fr: "Cet élément n'existe plus sur ce serveur.",
	},
	[SETTINGS_ISSUE_MESSAGES.unknownChoice]: {
		en: "This value is not one of the allowed choices.",
		fr: "Cette valeur ne fait pas partie des choix autorisés.",
	},
	[SETTINGS_ISSUE_MESSAGES.unknownField]: {
		en: "This setting does not exist.",
		fr: "Ce paramètre n'existe pas.",
	},
	[SETTINGS_MESSAGES.secretSet]: { en: "Set", fr: "Défini" },
	[SETTINGS_MESSAGES.secretNotSet]: { en: "Not set", fr: "Non défini" },
	[SETTINGS_MESSAGES.valueUnavailable]: {
		en: "A saved value is unavailable: it no longer exists on this server.",
		fr: "Une valeur enregistrée est indisponible : elle n'existe plus sur ce serveur.",
	},
	[SETTINGS_MESSAGES.valueNotSet]: { en: "Not set", fr: "Non défini" },
	[SETTINGS_MESSAGES.valueNone]: { en: "None", fr: "Aucun" },
	[SETTINGS_MESSAGES.booleanTrue]: { en: "Yes", fr: "Oui" },
	[SETTINGS_MESSAGES.booleanFalse]: { en: "No", fr: "Non" },
	[SETTINGS_MESSAGES.moduleDisabled]: {
		en: "This feature is disabled on this server.",
		fr: "Cette fonctionnalité est désactivée sur ce serveur.",
	},
	[SETTINGS_MESSAGES.moduleNotConfigured]: {
		en: "This feature is not configured on this server yet: an administrator must set it up first.",
		fr: "Cette fonctionnalité n'est pas encore configurée sur ce serveur : un administrateur doit d'abord la configurer.",
	},
	[SETTINGS_MESSAGES.moduleNotConfiguredMissing]: {
		en: "Missing settings: {fields}.",
		fr: "Paramètres manquants : {fields}.",
	},
	[KERNEL_SETTINGS_MESSAGES.title]: { en: "Server", fr: "Serveur" },
	[KERNEL_SETTINGS_MESSAGES.description]: {
		en: "Features enabled on this server and the bot's language.",
		fr: "Fonctionnalités activées sur ce serveur et langue du bot.",
	},
	[KERNEL_SETTINGS_MESSAGES.modules]: { en: "Features", fr: "Fonctionnalités" },
	[KERNEL_SETTINGS_MESSAGES.modulesDescription]: {
		en: "Turn a feature off to stop its commands, buttons and events on this server.",
		fr: "Désactivez une fonctionnalité pour arrêter ses commandes, boutons et événements sur ce serveur.",
	},
	[KERNEL_SETTINGS_MESSAGES.locale]: { en: "Language", fr: "Langue" },
	[KERNEL_SETTINGS_MESSAGES.localeDescription]: {
		en: "The bot's language on this server, when a member's own language is not supported.",
		fr: "La langue du bot sur ce serveur, lorsque la langue d'un membre n'est pas prise en charge.",
	},
	[KERNEL_SETTINGS_MESSAGES.localeEn]: { en: "English", fr: "Anglais" },
	[KERNEL_SETTINGS_MESSAGES.localeFr]: { en: "French", fr: "Français" },
};
