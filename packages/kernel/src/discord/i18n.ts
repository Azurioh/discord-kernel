import type { KeyedCatalog, MessageKey } from "@/i18n/catalog";

/** Catalog keys for the framework's own feedback, under the `core.` namespace. */
export const CORE_MESSAGES = {
	presenterSuccessTitle: "core.presenter.success-title",
	presenterWarningTitle: "core.presenter.warning-title",
	presenterErrorTitle: "core.presenter.error-title",
	presenterDenialTitle: "core.presenter.denial-title",
	presenterIncidentFooter: "core.presenter.incident-footer",
	unknownSubcommand: "core.command.unknown-subcommand",
	genericError: "core.command.generic-error",
	cooldownWait: "core.cooldown.wait",
	guardPermissionDenied: "core.guard.permission-denied",
	guardRoleDenied: "core.guard.role-denied",
	guardGuildOnly: "core.guard.guild-only",
} as const;

/**
 * Catalog keys for the settings editor's own chrome — the wording that is the
 * same whatever is being edited.
 *
 * Deliberately *not* the wording of the settings themselves: a field's label and
 * its one-line hint name something only the calling module knows about, so those
 * stay in that module's catalog and reach the editor as keys.
 */
export const SETTINGS_EDITOR_MESSAGES = {
	modalTitle: "core.settings-editor.modal-title",
	modalHelper: "core.settings-editor.modal-helper",
	modalUploadLabel: "core.settings-editor.modal-upload-label",
	modalUploadHelper: "core.settings-editor.modal-upload-helper",
	modalImageUrlLabel: "core.settings-editor.modal-image-url-label",
	modalImageHelper: "core.settings-editor.modal-image-helper",
	modalImageHelperUploaded: "core.settings-editor.modal-image-helper-uploaded",
	fieldSaved: "core.settings-editor.field-saved",
	fieldCleared: "core.settings-editor.field-cleared",
	fieldUploaded: "core.settings-editor.field-uploaded",
	resetButton: "core.settings-editor.reset-button",
	resetConfirmTitle: "core.settings-editor.reset-confirm-title",
	resetConfirmDescription: "core.settings-editor.reset-confirm-description",
	resetConfirmButton: "core.settings-editor.reset-confirm-button",
	resetCancelButton: "core.settings-editor.reset-cancel-button",
	resetDone: "core.settings-editor.reset-done",
	resetCancelled: "core.settings-editor.reset-cancelled",
	backButton: "core.settings-editor.back-button",
	/**
	 * A card screen's per-entry button: what selecting the entry from the old
	 * field menu used to do, now spelled on the button that replaces it. One
	 * wording for a field that opens a modal, another for one that descends a
	 * level — both generic enough that no card screen has ever needed its own.
	 */
	editFieldButton: "core.settings-editor.edit-field-button",
	openLevelButton: "core.settings-editor.open-level-button",
	/** The line under an entry whose declaration describes it no further. */
	entryHint: "core.settings-editor.entry-hint",
	/** A card entry's current value, under its hint. Takes `{value}`. */
	currentValue: "core.settings-editor.current-value",
	/** The entry a screen with more entries than one card holds moves the rest behind. */
	moreEntries: "core.settings-editor.more-entries",
	moreEntriesHint: "core.settings-editor.more-entries-hint",
} as const;

/**
 * The framework's own strings: presenter titles, the incident footer, dispatch
 * fallbacks and the default cooldown notice. Registered by the composition root
 * before any module catalog.
 */
export const CORE_CATALOG: KeyedCatalog<
	MessageKey<typeof CORE_MESSAGES> | MessageKey<typeof SETTINGS_EDITOR_MESSAGES>
> = {
	[CORE_MESSAGES.presenterSuccessTitle]: { en: "Success", fr: "Succès" },
	[CORE_MESSAGES.presenterWarningTitle]: { en: "Warning", fr: "Avertissement" },
	[CORE_MESSAGES.presenterErrorTitle]: { en: "Error", fr: "Erreur" },
	[CORE_MESSAGES.presenterDenialTitle]: { en: "Access denied", fr: "Accès refusé" },
	[CORE_MESSAGES.presenterIncidentFooter]: {
		en: "Ref: {reference} · contact an admin if this persists",
		fr: "Réf : {reference} · contactez un admin si le problème persiste",
	},
	[CORE_MESSAGES.unknownSubcommand]: {
		en: "Unknown subcommand.",
		fr: "Sous-commande inconnue.",
	},
	[CORE_MESSAGES.genericError]: {
		en: "Something went wrong.",
		fr: "Une erreur est survenue.",
	},
	[CORE_MESSAGES.cooldownWait]: {
		en: "Slow down — try again in {seconds}s.",
		fr: "Doucement — réessayez dans {seconds}s.",
	},
	[CORE_MESSAGES.guardPermissionDenied]: {
		en: "You do not have permission to use this command. Missing: {missing}.",
		fr: "Vous n'avez pas la permission d'utiliser cette commande. Manquant : {missing}.",
	},
	[CORE_MESSAGES.guardRoleDenied]: {
		en: "You do not have the role required to use this command.",
		fr: "Vous n'avez pas le rôle requis pour utiliser cette commande.",
	},
	[CORE_MESSAGES.guardGuildOnly]: {
		en: "This command can only be used in a server.",
		fr: "Cette commande ne peut être utilisée que sur un serveur.",
	},
	[SETTINGS_EDITOR_MESSAGES.modalTitle]: {
		en: "Edit: {field}",
		fr: "Modifier : {field}",
	},
	[SETTINGS_EDITOR_MESSAGES.modalHelper]: {
		en: "Leave empty to clear your customisation and go back to the default.",
		fr: "Laissez vide pour effacer votre personnalisation et revenir à la valeur par défaut.",
	},
	[SETTINGS_EDITOR_MESSAGES.modalUploadLabel]: {
		en: "Upload an image",
		fr: "Envoyer une image",
	},
	[SETTINGS_EDITOR_MESSAGES.modalUploadHelper]: {
		en: "PNG, JPEG, GIF or WebP, up to {max} MiB. An upload wins over the address below.",
		fr: "PNG, JPEG, GIF ou WebP, jusqu'à {max} Mio. Un envoi l'emporte sur l'adresse ci-dessous.",
	},
	[SETTINGS_EDITOR_MESSAGES.modalImageUrlLabel]: {
		en: "…or an image address",
		fr: "…ou une adresse d'image",
	},
	[SETTINGS_EDITOR_MESSAGES.modalImageHelper]: {
		en: "An http(s) address. Leave both empty to restore the default.",
		fr: "Une adresse http(s). Laissez les deux vides pour revenir au défaut.",
	},
	[SETTINGS_EDITOR_MESSAGES.modalImageHelperUploaded]: {
		en: "An image is uploaded; it cannot be shown here. Empty both to restore the default.",
		fr: "Une image est envoyée ; impossible de la réafficher. Videz les deux pour le défaut.",
	},
	[SETTINGS_EDITOR_MESSAGES.fieldSaved]: {
		en: "✅ {field} updated.",
		fr: "✅ {field} mis à jour.",
	},
	[SETTINGS_EDITOR_MESSAGES.fieldCleared]: {
		en: "✅ {field} cleared — the default is used again.",
		fr: "✅ {field} effacé — la valeur par défaut est de nouveau utilisée.",
	},
	[SETTINGS_EDITOR_MESSAGES.fieldUploaded]: {
		en: "✅ {field} updated with your upload.",
		fr: "✅ {field} mis à jour avec votre envoi.",
	},
	[SETTINGS_EDITOR_MESSAGES.resetButton]: {
		en: "Reset everything",
		fr: "Tout réinitialiser",
	},
	[SETTINGS_EDITOR_MESSAGES.resetConfirmTitle]: {
		en: "Reset every field?",
		fr: "Réinitialiser tous les champs ?",
	},
	[SETTINGS_EDITOR_MESSAGES.resetConfirmDescription]: {
		en: "Every field goes back to its default. An uploaded image is not merely unset — its file is deleted for good and cannot be recovered. The preview below is what you are about to lose.",
		fr: "Chaque champ revient à sa valeur par défaut. Une image envoyée n'est pas simplement retirée : le fichier est supprimé définitivement et ne pourra pas être récupéré. L'aperçu ci-dessous est ce que vous êtes sur le point de perdre.",
	},
	[SETTINGS_EDITOR_MESSAGES.resetConfirmButton]: {
		en: "Reset for good",
		fr: "Réinitialiser définitivement",
	},
	[SETTINGS_EDITOR_MESSAGES.resetCancelButton]: {
		en: "Cancel",
		fr: "Annuler",
	},
	[SETTINGS_EDITOR_MESSAGES.resetDone]: {
		en: "✅ Every field is back to its default.",
		fr: "✅ Tous les champs sont revenus à leur valeur par défaut.",
	},
	[SETTINGS_EDITOR_MESSAGES.resetCancelled]: {
		en: "Nothing was reset. Your customisation is untouched.",
		fr: "Rien n'a été réinitialisé. Votre personnalisation est intacte.",
	},
	[SETTINGS_EDITOR_MESSAGES.backButton]: {
		en: "Back",
		fr: "Retour",
	},
	[SETTINGS_EDITOR_MESSAGES.editFieldButton]: {
		en: "Edit",
		fr: "Modifier",
	},
	[SETTINGS_EDITOR_MESSAGES.openLevelButton]: {
		en: "Open",
		fr: "Ouvrir",
	},
	[SETTINGS_EDITOR_MESSAGES.entryHint]: {
		en: "Edit this setting.",
		fr: "Modifiez ce paramètre.",
	},
	[SETTINGS_EDITOR_MESSAGES.currentValue]: {
		en: "Current: {value}",
		fr: "Actuel : {value}",
	},
	[SETTINGS_EDITOR_MESSAGES.moreEntries]: {
		en: "More settings",
		fr: "Plus de paramètres",
	},
	[SETTINGS_EDITOR_MESSAGES.moreEntriesHint]: {
		en: "The settings that do not fit on this page.",
		fr: "Les paramètres qui ne tiennent pas sur cette page.",
	},
};
