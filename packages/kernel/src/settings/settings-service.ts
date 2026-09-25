import { isDeepStrictEqual } from "node:util";
import type { Clock } from "@/clock";
import { ConflictError, ValidationError } from "@/errors/business-error";
import { errorMessage } from "@/errors/error-message";
import type { Translator } from "@/i18n/translator";
import type { Logger } from "@/logger";
import { createSettingsCache } from "@/settings/cache";
import { decodeStored } from "@/settings/decode-stored";
import type { SettingsDeclaration } from "@/settings/define-settings";
import { describeSettings, type SettingsSchema } from "@/settings/describe";
import { SETTINGS_ISSUE_MESSAGES } from "@/settings/messages";
import { migrateStored } from "@/settings/migrate";
import type { GuildDirectory } from "@/settings/ports/guild-directory";
import type { SettingsChangedNotifier } from "@/settings/ports/settings-changed-notifier";
import type { SettingsStore, StoredSettings } from "@/settings/ports/settings-store";
import type { SettingsRegistry } from "@/settings/registry";
import { type SettingsIssue, SettingsValidationError } from "@/settings/settings-validation-error";
import { type SettingsStatus, settingsStatus } from "@/settings/status";
import type { SettingsValues, SurfaceValues } from "@/settings/types";
import { validateSettings } from "@/settings/validate";

/** Who asks, for which guild and in which language. */
export interface RequestContext {
	readonly guildId: string;
	readonly userId: string;
	readonly locale: string;
}

/**
 * Outcome of {@link SettingsService.validate}: the submitted fields in their
 * stored form (an unset field maps to `undefined`), or every issue found.
 */
export type ValidationResult<D extends SettingsDeclaration> =
	| { readonly ok: true; readonly values: Partial<SettingsValues<D>> }
	| { readonly ok: false; readonly issues: readonly SettingsIssue[] };

/** Reads and writes the settings modules declare, per guild. */
export interface SettingsService {
	/**
	 * Module logic read: every declared field, secrets included. A field with
	 * no valid stored value reads as its default. Cached per guild and module
	 * until a change of them (this service's writes, or a notifier event) or
	 * `SETTINGS_CACHE_TTL_MS`, whichever comes first.
	 *
	 * Writes only to migrate (FR-018): values stored under an older declaration
	 * version go through the declaration's `migrate`, are validated, and are
	 * written back once under the declared version, like any other write. A
	 * migration that throws or yields invalid values writes nothing and is
	 * logged; the guild then reads defaults for the fields it cannot read.
	 * Values stored under a newer version are never written (FR-019).
	 */
	get<D extends SettingsDeclaration>(declaration: D, guildId: string): Promise<SettingsValues<D>>;

	/**
	 * Surface read: like {@link get}, with each secret replaced by whether it
	 * is set. A secret's value never leaves the service through a surface.
	 */
	getForSurface<D extends SettingsDeclaration>(
		declaration: D,
		guildId: string,
	): Promise<SurfaceValues<D>>;

	/**
	 * Configuration status (FR-040): the required fields without default the
	 * guild left unset, read through the same cache as {@link get}, so a write
	 * shows at once. A stored value that fails validation counts as unset.
	 */
	status(declaration: SettingsDeclaration, guildId: string): Promise<SettingsStatus>;

	/**
	 * Validate a submission without writing: the same checks as {@link set},
	 * shared by every surface.
	 *
	 * @throws ValidationError when `ctx` is for another guild than `guildId`.
	 */
	validate<D extends SettingsDeclaration>(
		declaration: D,
		guildId: string,
		patch: unknown,
		ctx: RequestContext,
	): Promise<ValidationResult<D>>;

	/**
	 * Validate a submission, then merge it onto the stored values in one write:
	 * nothing is stored unless every field is valid. A field submitted as
	 * `null` is unset; stored fields the declaration no longer declares are
	 * dropped. Values stored under an older declaration version are migrated
	 * first, so the patch merges onto the values the guild reads. Emits a
	 * settings change once written.
	 *
	 * @returns the written record.
	 * @throws SettingsValidationError listing every invalid field.
	 * @throws ConflictError when `ctx.expectedRevision` is not the stored
	 * revision, or when the stored record was written under a newer declaration
	 * version.
	 * @throws ValidationError when `ctx` is for another guild than `guildId`.
	 */
	set<D extends SettingsDeclaration>(
		declaration: D,
		guildId: string,
		patch: unknown,
		ctx: RequestContext & { readonly expectedRevision?: number },
	): Promise<StoredSettings>;

	/**
	 * Unset the given fields (or every field), so they read as their defaults.
	 * Writes nothing for a guild that never stored settings. Like
	 * {@link set}, migrates older stored values before unsetting.
	 *
	 * @throws SettingsValidationError when a key is not declared.
	 * @throws ConflictError when the stored record changed concurrently or was
	 * written under a newer declaration version.
	 * @throws ValidationError when `ctx` is for another guild than `guildId`.
	 */
	reset<D extends SettingsDeclaration>(
		declaration: D,
		guildId: string,
		keys: readonly string[] | "all",
		ctx: RequestContext,
	): Promise<void>;

	/**
	 * Describe a module's settings for surfaces other than Discord (FR-030), as
	 * a JSON Schema with every text translated.
	 *
	 * @param locale - any locale string; an unsupported one falls back to English.
	 */
	describe(declaration: SettingsDeclaration, locale: string): SettingsSchema;
}

interface SettingsServiceDeps {
	readonly registry: SettingsRegistry;
	readonly store: SettingsStore;
	readonly guilds: GuildDirectory;
	readonly notifier: SettingsChangedNotifier;
	readonly translator: Translator;
	readonly clock: Clock;
	readonly logger: Logger;
}

/**
 * Create the settings service over its ports.
 *
 * @param deps - the registry of declarations and the ports the service reads,
 * writes, notifies and logs through.
 * @returns the service shared by module logic and every configuration surface.
 */
export function createSettingsService(deps: SettingsServiceDeps): SettingsService {
	const { store, guilds, notifier, translator, clock, logger } = deps;
	const cache = createSettingsCache({ clock, notifier });

	/**
	 * What a guild reads of `stored`: its valid declared fields, defaults not
	 * applied, migrated in memory when stored under an older version. Logs
	 * every field it has to drop and every failed migration.
	 *
	 * @returns the values, and whether they are a successful migration still to
	 * be written back.
	 */
	function readable(
		declaration: SettingsDeclaration,
		stored: StoredSettings | null,
	): { values: Readonly<Record<string, unknown>>; migrated: boolean } {
		if (stored === null) {
			return { values: {}, migrated: false };
		}
		const at = { guildId: stored.guildId, moduleId: declaration.id };
		if (stored.version < declaration.version) {
			const outcome = migrateStored(declaration, stored);
			if (!outcome.ok) {
				logger.error(
					{
						...at,
						fromVersion: stored.version,
						toVersion: declaration.version,
						keys: outcome.invalidKeys,
						...(outcome.error === undefined ? {} : { err: errorMessage(outcome.error) }),
					},
					"Settings migration failed; storage left unchanged, reading defaults for the fields it cannot read",
				);
			}
			return { values: outcome.values, migrated: outcome.ok };
		}
		const decoded = decodeStored(declaration, stored.values);
		if (decoded.invalidKeys.length > 0) {
			logger.error(
				{ ...at, keys: decoded.invalidKeys },
				"Stored settings failed validation; reading defaults for these fields",
			);
		}
		return { values: decoded.values, migrated: false };
	}

	/**
	 * Write a successful migration back, expecting the revision it was read at.
	 * When another reader (another shard) wrote first, its record is read
	 * again instead: the conflict is not the caller's to handle.
	 */
	async function writeBack(params: {
		declaration: SettingsDeclaration;
		stored: StoredSettings;
		values: Readonly<Record<string, unknown>>;
	}): Promise<Readonly<Record<string, unknown>>> {
		const { declaration, stored, values } = params;
		const keys = new Set([...Object.keys(stored.values), ...Object.keys(values)]);
		const changedKeys = [...keys].filter(
			(key) => !isDeepStrictEqual(stored.values[key], values[key]),
		);
		try {
			await write({
				declaration,
				guildId: stored.guildId,
				stored,
				expectedRevision: stored.revision,
				values,
				changedKeys,
				author: undefined,
			});
			return values;
		} catch (error) {
			if (error instanceof ConflictError) {
				const latest = await store.read(stored.guildId, declaration.id);
				return readable(declaration, latest).values;
			}
			logger.error(
				{
					guildId: stored.guildId,
					moduleId: declaration.id,
					fromVersion: stored.version,
					toVersion: declaration.version,
					err: errorMessage(error),
				},
				"Failed to write migrated settings back; reading the migrated values",
			);
			return values;
		}
	}

	/** Read and decode a guild's stored settings, bypassing the cache. */
	async function load<D extends SettingsDeclaration>(
		declaration: D,
		guildId: string,
	): Promise<SettingsValues<D>> {
		const stored = await store.read(guildId, declaration.id);
		const read = readable(declaration, stored);
		const values =
			read.migrated && stored !== null
				? await writeBack({ declaration, stored, values: read.values })
				: read.values;
		const withDefaults = Object.entries(declaration.fields).map(([key, declared]) => [
			key,
			Object.hasOwn(values, key) ? values[key] : declared.default,
		]);
		return Object.fromEntries(withDefaults) as SettingsValues<D>;
	}

	function get<D extends SettingsDeclaration>(
		declaration: D,
		guildId: string,
	): Promise<SettingsValues<D>> {
		return cache.read(guildId, declaration.id, () => load(declaration, guildId));
	}

	/**
	 * Write `values` over `stored` under the declared version and tell
	 * listeners which keys changed. `author` is the user who asked, or
	 * `undefined` for a write the kernel makes on its own (a migration).
	 */
	async function write(params: {
		declaration: SettingsDeclaration;
		guildId: string;
		stored: StoredSettings | null;
		expectedRevision: number | null;
		values: Readonly<Record<string, unknown>>;
		changedKeys: readonly string[];
		author: string | undefined;
	}): Promise<StoredSettings> {
		const { declaration, guildId, stored, author } = params;
		const next: StoredSettings = {
			guildId,
			moduleId: declaration.id,
			version: declaration.version,
			revision: (stored?.revision ?? 0) + 1,
			values: params.values,
			updatedAt: clock.now().toISOString(),
			...(author === undefined ? {} : { updatedBy: author }),
		};
		await store.write(next, { expectedRevision: params.expectedRevision });
		// Before notifying: a listener that reads back must see the new values.
		cache.invalidate(guildId, declaration.id);
		notifier.notify({
			guildId,
			moduleId: declaration.id,
			changedKeys: params.changedKeys,
			revision: next.revision,
			...(author === undefined ? {} : { changedBy: author }),
		});
		return next;
	}

	return {
		get,

		async getForSurface<D extends SettingsDeclaration>(
			declaration: D,
			guildId: string,
		): Promise<SurfaceValues<D>> {
			const values: Record<string, unknown> = await get(declaration, guildId);
			const surface = Object.entries(values).map(([key, value]) =>
				declaration.fields[key]?.spec.kind === "secret"
					? [key, { isSet: value !== undefined }]
					: [key, value],
			);
			return Object.fromEntries(surface) as SurfaceValues<D>;
		},

		async status(declaration: SettingsDeclaration, guildId: string): Promise<SettingsStatus> {
			return settingsStatus(declaration, await get(declaration, guildId));
		},

		async validate<D extends SettingsDeclaration>(
			declaration: D,
			guildId: string,
			patch: unknown,
			ctx: RequestContext,
		): Promise<ValidationResult<D>> {
			assertSameGuild(guildId, ctx);
			const result = await validateSettings({ declaration, guildId, patch, guilds });
			return result as ValidationResult<D>;
		},

		async set<D extends SettingsDeclaration>(
			declaration: D,
			guildId: string,
			patch: unknown,
			ctx: RequestContext & { readonly expectedRevision?: number },
		): Promise<StoredSettings> {
			assertSameGuild(guildId, ctx);
			const result = await validateSettings({ declaration, guildId, patch, guilds });
			if (!result.ok) {
				throw new SettingsValidationError(result.issues);
			}
			const stored = await store.read(guildId, declaration.id);
			assertWritable(declaration, stored);
			const values = { ...readable(declaration, stored).values };
			for (const [key, value] of Object.entries(result.values)) {
				if (value === undefined) {
					delete values[key];
				} else {
					values[key] = value;
				}
			}
			return write({
				declaration,
				guildId,
				stored,
				expectedRevision:
					ctx.expectedRevision === undefined ? (stored?.revision ?? null) : ctx.expectedRevision,
				values,
				changedKeys: Object.keys(result.values),
				author: ctx.userId,
			});
		},

		async reset<D extends SettingsDeclaration>(
			declaration: D,
			guildId: string,
			keys: readonly string[] | "all",
			ctx: RequestContext,
		): Promise<void> {
			assertSameGuild(guildId, ctx);
			const declaredKeys = Object.keys(declaration.fields);
			const resetKeys = keys === "all" ? declaredKeys : keys;
			const issues = resetKeys.filter((key) => !declaredKeys.includes(key)).map(unknownField);
			if (issues.length > 0) {
				throw new SettingsValidationError(issues);
			}
			const stored = await store.read(guildId, declaration.id);
			if (stored === null) {
				return;
			}
			assertWritable(declaration, stored);
			const values = { ...readable(declaration, stored).values };
			for (const key of resetKeys) {
				delete values[key];
			}
			await write({
				declaration,
				guildId,
				stored,
				expectedRevision: stored.revision,
				values,
				changedKeys: resetKeys,
				author: ctx.userId,
			});
		},

		describe(declaration: SettingsDeclaration, locale: string): SettingsSchema {
			return describeSettings({ declaration, locale, translator });
		},
	};
}

/**
 * A surface acts for the guild of its request only: a context of another
 * guild is a malformed request, rejected before anything is read or written.
 */
function assertSameGuild(guildId: string, ctx: RequestContext): void {
	if (ctx.guildId !== guildId) {
		throw new ValidationError(
			`Settings request for guild ${ctx.guildId} cannot target guild ${guildId}`,
		);
	}
}

/** A record written under a newer declaration version is never overwritten (FR-019). */
function assertWritable(declaration: SettingsDeclaration, stored: StoredSettings | null): void {
	if (stored !== null && stored.version > declaration.version) {
		throw new ConflictError(
			`Settings of module "${declaration.id}" in guild ${stored.guildId} were written under version ${stored.version}, newer than the declared version ${declaration.version}`,
		);
	}
}

function unknownField(key: string): SettingsIssue {
	return {
		field: key,
		code: "unknownField",
		translation: { key: SETTINGS_ISSUE_MESSAGES.unknownField },
	};
}
