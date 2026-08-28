/**
 * Two catalogs declared the same translation key. Raised while modules register
 * their catalogs at boot — a wiring mistake that must stop the boot, never a
 * runtime condition.
 */
export class DuplicateTranslationKeyError extends Error {
	constructor(readonly key: string) {
		super(`Translation key "${key}" is registered twice`);
		this.name = "DuplicateTranslationKeyError";
	}
}
