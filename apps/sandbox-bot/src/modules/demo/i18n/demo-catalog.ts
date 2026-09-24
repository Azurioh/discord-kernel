import { DEMO_MESSAGES, DEMO_SETTINGS_MESSAGES } from "@/modules/demo/i18n/demo-messages";
import type { MessageKey, ModuleCatalog } from "@/shared/i18n/module-catalog";

/** The demo module's wording in English and French, keyed by its `*_MESSAGES` constants. */
export const DEMO_CATALOG: ModuleCatalog<
	MessageKey<typeof DEMO_MESSAGES> | MessageKey<typeof DEMO_SETTINGS_MESSAGES>
> = {
	[DEMO_MESSAGES.configDescription]: {
		en: "Read and change the demo settings",
		fr: "Lire et modifier les paramètres de la démo",
	},
	[DEMO_MESSAGES.showDescription]: {
		en: "Show every demo setting",
		fr: "Afficher tous les paramètres de la démo",
	},
	[DEMO_MESSAGES.setDescription]: {
		en: "Change one demo setting",
		fr: "Modifier un paramètre de la démo",
	},
	[DEMO_MESSAGES.setKeyDescription]: {
		en: "The setting to change",
		fr: "Le paramètre à modifier",
	},
	[DEMO_MESSAGES.setValueDescription]: {
		en: "The new value: JSON, or plain text",
		fr: "La nouvelle valeur : du JSON, ou du texte brut",
	},
	[DEMO_MESSAGES.resetDescription]: {
		en: "Put one demo setting, or all of them, back to the default",
		fr: "Remettre un paramètre de la démo, ou tous, à la valeur par défaut",
	},
	[DEMO_MESSAGES.resetKeyDescription]: {
		en: "The setting to reset, or all",
		fr: "Le paramètre à réinitialiser, ou tous",
	},
	[DEMO_MESSAGES.hiddenFields]: {
		en: "{count} more settings not shown.",
		fr: "{count} autres paramètres non affichés.",
	},
	[DEMO_MESSAGES.notSet]: { en: "*not set*", fr: "*non défini*" },
	[DEMO_MESSAGES.secretSet]: { en: "set (hidden)", fr: "défini (masqué)" },
	[DEMO_MESSAGES.secretNotSet]: { en: "not set", fr: "non défini" },
	[DEMO_MESSAGES.on]: { en: "on", fr: "activé" },
	[DEMO_MESSAGES.off]: { en: "off", fr: "désactivé" },
	[DEMO_MESSAGES.saved]: {
		en: "**{field}** saved (revision {revision}).",
		fr: "**{field}** enregistré (révision {revision}).",
	},
	[DEMO_MESSAGES.rejected]: {
		en: "Nothing was saved:\n{issues}",
		fr: "Rien n'a été enregistré :\n{issues}",
	},
	[DEMO_MESSAGES.resetOne]: {
		en: "**{field}** is back to its default.",
		fr: "**{field}** est revenu à sa valeur par défaut.",
	},
	[DEMO_MESSAGES.resetAll]: {
		en: "Every demo setting is back to its default.",
		fr: "Tous les paramètres de la démo sont revenus à leur valeur par défaut.",
	},
	[DEMO_MESSAGES.allFields]: { en: "All settings", fr: "Tous les paramètres" },

	[DEMO_SETTINGS_MESSAGES.title]: { en: "Demo", fr: "Démo" },
	[DEMO_SETTINGS_MESSAGES.description]: {
		en: "Settings of the sandbox demo module.",
		fr: "Paramètres du module de démonstration.",
	},
	[DEMO_SETTINGS_MESSAGES.logChannel]: { en: "Log channel", fr: "Salon de journalisation" },
	[DEMO_SETTINGS_MESSAGES.logChannelDescription]: {
		en: "A text or announcement channel.",
		fr: "Un salon textuel ou d'annonces.",
	},
	[DEMO_SETTINGS_MESSAGES.staffRole]: { en: "Staff role", fr: "Rôle du staff" },
	[DEMO_SETTINGS_MESSAGES.accent]: { en: "Accent colour", fr: "Couleur d'accent" },
	[DEMO_SETTINGS_MESSAGES.cooldown]: { en: "Cooldown (seconds)", fr: "Délai (secondes)" },
	[DEMO_SETTINGS_MESSAGES.mode]: { en: "Mode", fr: "Mode" },
	[DEMO_SETTINGS_MESSAGES.modeRelaxed]: { en: "Relaxed", fr: "Souple" },
	[DEMO_SETTINGS_MESSAGES.modeStrict]: { en: "Strict", fr: "Strict" },
	[DEMO_SETTINGS_MESSAGES.maxWarnings]: { en: "Maximum warnings", fr: "Avertissements maximum" },
	[DEMO_SETTINGS_MESSAGES.features]: { en: "Features", fr: "Fonctionnalités" },
	[DEMO_SETTINGS_MESSAGES.featuresWelcome]: {
		en: "Welcome message",
		fr: "Message de bienvenue",
	},
	[DEMO_SETTINGS_MESSAGES.featuresLogs]: { en: "Logs", fr: "Journaux" },
	[DEMO_SETTINGS_MESSAGES.apiKey]: { en: "API key", fr: "Clé d'API" },
	[DEMO_SETTINGS_MESSAGES.pingRoles]: { en: "Roles to ping", fr: "Rôles à mentionner" },
};
