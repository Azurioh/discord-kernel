import { DuplicateModuleError, ModuleRegistrationError } from "@/bot/bot-errors";
import { CORE_CATALOG } from "@/discord/i18n";
import { TranslationRegistry } from "@/i18n/catalog";
import type { BotModule, ModuleParts } from "@/module/module";
import type { BotServices } from "@/module/module-context";
import type { SettingsDeclaration } from "@/settings/define-settings";
import { SETTINGS_CATALOG } from "@/settings/messages";
import { createSettingsRegistry, type SettingsRegistry } from "@/settings/registry";
import { SettingsDeclarationError } from "@/settings/settings-declaration-error";

const MODULE_PARTS = [
	"commands",
	"contextMenuCommands",
	"components",
	"events",
	"jobs",
	"setup",
	"teardown",
] as const;

/** Validate names and catalogs, then declarations, before any module is built.
 * @param modules - Modules in registration order.
 * @returns Shared translations and the validated settings registry.
 * @throws DuplicateModuleError for duplicate names.
 * @throws ModuleRegistrationError for catalog or settings failures.
 */
export function assembleModules(modules: readonly BotModule[]): {
	translations: TranslationRegistry;
	registry: SettingsRegistry;
} {
	const names = new Set<string>();
	for (const module of modules) {
		if (names.has(module.name)) {
			throw new DuplicateModuleError(module.name, module.name);
		}
		names.add(module.name);
	}
	const translations = new TranslationRegistry();
	translations.register(CORE_CATALOG);
	translations.register(SETTINGS_CATALOG);
	for (const module of modules) {
		try {
			if (module.translations !== undefined) {
				translations.register(module.translations);
			}
		} catch (cause) {
			throw new ModuleRegistrationError(module.name, cause);
		}
	}
	const declarations: SettingsDeclaration[] = [];
	const owners = new Map<string, string>();
	const duplicateOwners = new Map<string, string>();
	for (const module of modules) {
		try {
			createSettingsRegistry({
				declarations: module.settings ?? [],
				translations,
				modules: module.gated === false ? [] : [module],
			});
		} catch (cause) {
			throw new ModuleRegistrationError(module.name, cause);
		}
		for (const declaration of module.settings ?? []) {
			if (owners.has(declaration.id) && !duplicateOwners.has(declaration.id)) {
				duplicateOwners.set(declaration.id, module.name);
			}
			owners.set(declaration.id, module.name);
			declarations.push(declaration);
		}
	}
	try {
		const registry = createSettingsRegistry({
			declarations,
			translations,
			modules: modules.filter(isGated),
		});
		return { translations, registry };
	} catch (cause) {
		if (cause instanceof SettingsDeclarationError) {
			const owner = duplicateOwners.get(cause.declarationId) ?? owners.get(cause.declarationId);
			if (owner !== undefined) {
				throw new ModuleRegistrationError(owner, cause);
			}
		}
		throw cause;
	}
}

/** Build each module once, rejecting parts provided both statically and by build.
 * @param params - Modules and the finished services to inject.
 * @returns Modules with their built parts merged in registration order.
 * @throws ModuleRegistrationError when build fails or duplicates a part.
 */
export function buildModules(params: {
	modules: readonly BotModule[];
	services: BotServices;
}): readonly BotModule[] {
	const built: BotModule[] = [];
	for (const module of params.modules) {
		let parts: ModuleParts;
		try {
			parts =
				module.build?.({
					...params.services,
					logger: params.services.logger.child({ module: module.name }),
				}) ?? {};
		} catch (cause) {
			throw new ModuleRegistrationError(module.name, cause);
		}
		for (const part of MODULE_PARTS) {
			if (module[part] !== undefined && parts[part] !== undefined) {
				throw new ModuleRegistrationError(
					module.name,
					new TypeError(`Module part "${part}" is declared twice`),
					part,
				);
			}
		}
		built.push({ ...module, ...parts });
	}
	return built;
}

function isGated(module: BotModule): boolean {
	return module.gated !== false;
}
