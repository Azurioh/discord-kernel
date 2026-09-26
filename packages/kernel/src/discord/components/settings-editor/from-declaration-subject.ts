import { storedIds } from "@/discord/components/settings-editor/from-declaration-stored";
import type { SettingsDeclaration } from "@/settings/define-settings";
import { fieldSearch } from "@/settings/field-search";
import type { AnyField } from "@/settings/fields/field";
import type { RequestContext, SettingsService } from "@/settings/settings-service";
import type { SettingsIssueCode } from "@/settings/settings-validation-error";

/**
 * What the settings screen shows for one guild: every declared field as a
 * surface reads it (a secret as whether it is set), the stored channels,
 * roles and members the guild no longer has, and the label a searchable
 * field's search gives its value.
 */
export interface DeclarationSubject {
	readonly values: Readonly<Record<string, unknown>>;
	/** Per field key, the stored ids the guild no longer offers. */
	readonly unavailable: Readonly<Record<string, readonly string[]>>;
	/** Per searchable field key, its search's label of the value, when it has one. */
	readonly labels: Readonly<Record<string, string>>;
}

/** The issues that say a stored id no longer names a usable entity of the guild. */
const UNAVAILABLE_CODES: ReadonlySet<SettingsIssueCode> = new Set(["notFound", "channelType"]);

/**
 * Read the guild's settings of a declaration for the screen, and find which
 * stored entities it no longer has by asking the service's own validator
 * about each one, so the screen and every other surface agree on it.
 * A searchable field's value is labelled through `service.label`.
 *
 * @param params.declaration - the module's settings declaration.
 * @param params.service - the settings service the screen reads through.
 * @param params.ctx - the guild, the administrator and their locale.
 * @returns the screen's subject.
 */
export async function loadDeclarationSubject(params: {
	declaration: SettingsDeclaration;
	service: SettingsService;
	ctx: RequestContext;
}): Promise<DeclarationSubject> {
	const { declaration, service, ctx } = params;
	const values: Readonly<Record<string, unknown>> = await service.getForSurface(
		declaration,
		ctx.guildId,
	);
	const checked = await Promise.all(
		Object.entries(declaration.fields).map(async ([key, declared]) => {
			const missing = await unavailableIds({ ...params, key, declared, value: values[key] });
			return [key, missing] as const;
		}),
	);
	const labelled = await Promise.all(
		Object.entries(declaration.fields).map(async ([key, declared]) => {
			const value = values[key];
			if (value === undefined || fieldSearch(declared.spec) === undefined) {
				return [];
			}
			const label = await service.label(declaration, key, value, ctx);
			return label === undefined ? [] : [[key, label] as const];
		}),
	);
	return {
		values,
		unavailable: Object.fromEntries(checked.filter(hasMissingIds)),
		labels: Object.fromEntries(labelled.flat()),
	};
}

function hasMissingIds(entry: readonly [string, readonly string[]]): boolean {
	return entry[1].length > 0;
}

/** The ids a field stores that the guild no longer offers. */
async function unavailableIds(params: {
	declaration: SettingsDeclaration;
	service: SettingsService;
	ctx: RequestContext;
	key: string;
	declared: AnyField;
	value: unknown;
}): Promise<readonly string[]> {
	const { declaration, service, ctx, key, declared, value } = params;
	const isList = declared.spec.kind === "list";
	if (!isEntityKind(itemKind(declared))) {
		return [];
	}
	const ids = storedIds(value);
	const usable = await Promise.all(
		ids.map(async (id) => {
			const result = await service.validate(
				declaration,
				ctx.guildId,
				{ [key]: isList ? [id] : id },
				ctx,
			);
			return result.ok || !result.issues.some((issue) => UNAVAILABLE_CODES.has(issue.code));
		}),
	);
	return ids.filter((_, index) => usable[index] === false);
}

/** The kind of a list's items, or of the field itself when it is not a list. */
function itemKind(declared: AnyField): string {
	return declared.spec.kind === "list" ? declared.spec.item.spec.kind : declared.spec.kind;
}

/** Whether a field of this kind references a channel, a role or a member of the guild. */
function isEntityKind(kind: string): boolean {
	return kind === "channel" || kind === "role" || kind === "user";
}
