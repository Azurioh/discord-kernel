import type { Catalog } from "@azurioh/discord-kernel/i18n/catalog";

export const DEMO_MESSAGES = {
	hiddenFields: "demo.config.hidden-fields",
	notSet: "demo.config.not-set",
	secretSet: "demo.config.secret-set",
	secretNotSet: "demo.config.secret-not-set",
	on: "demo.config.on",
	off: "demo.config.off",
	saved: "demo.config.saved",
	rejected: "demo.config.rejected",
	resetOne: "demo.config.reset-one",
	resetAll: "demo.config.reset-all",
	allFields: "demo.config.all-fields",
} as const;

/** The `/config` wording, then the settings' own labels (keys used by `demoSettings`). */
export const DEMO_CATALOG: Catalog = {
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

	"demo.settings.title": { en: "Demo", fr: "Démo" },
	"demo.settings.description": {
		en: "Settings of the sandbox demo module.",
		fr: "Paramètres du module de démonstration.",
	},
	"demo.settings.log-channel": { en: "Log channel", fr: "Salon de journalisation" },
	"demo.settings.log-channel.description": {
		en: "A text or announcement channel.",
		fr: "Un salon textuel ou d'annonces.",
	},
	"demo.settings.staff-role": { en: "Staff role", fr: "Rôle du staff" },
	"demo.settings.accent": { en: "Accent colour", fr: "Couleur d'accent" },
	"demo.settings.cooldown": { en: "Cooldown (seconds)", fr: "Délai (secondes)" },
	"demo.settings.mode": { en: "Mode", fr: "Mode" },
	"demo.settings.mode.relaxed": { en: "Relaxed", fr: "Souple" },
	"demo.settings.mode.strict": { en: "Strict", fr: "Strict" },
	"demo.settings.max-warnings": { en: "Maximum warnings", fr: "Avertissements maximum" },
	"demo.settings.features": { en: "Features", fr: "Fonctionnalités" },
	"demo.settings.features.welcome": { en: "Welcome message", fr: "Message de bienvenue" },
	"demo.settings.features.logs": { en: "Logs", fr: "Journaux" },
	"demo.settings.api-key": { en: "API key", fr: "Clé d'API" },
	"demo.settings.ping-roles": { en: "Roles to ping", fr: "Rôles à mentionner" },
};
