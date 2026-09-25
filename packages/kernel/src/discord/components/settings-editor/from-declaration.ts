import {
	type DeclarationControl,
	declarationControls,
} from "@/discord/components/settings-editor/from-declaration-controls";
import { controlDisplay } from "@/discord/components/settings-editor/from-declaration-display";
import { layoutDeclaration } from "@/discord/components/settings-editor/from-declaration-layout";
import {
	type DeclarationSubject,
	loadDeclarationSubject,
} from "@/discord/components/settings-editor/from-declaration-subject";
import {
	controlValue,
	isUnchanged,
	withSubmission,
} from "@/discord/components/settings-editor/from-declaration-values";
import type {
	SettingsEditorOptions,
	SettingsEditorWrite,
} from "@/discord/components/settings-editor/mount-settings-editor";
import type {
	SettingsEditorGroupMemberSubmission,
	SettingsEditorGroupSubmission,
	SettingsEditorSubmission,
} from "@/discord/components/settings-editor/settings-editor-field-modal";
import { NotFoundError } from "@/errors/business-error";
import type { Locale } from "@/i18n/locale";
import type { TranslateKey, Translator } from "@/i18n/translator";
import type { SettingsDeclaration } from "@/settings/define-settings";
import { displayOrder } from "@/settings/field-order";
import type { RequestContext, SettingsService } from "@/settings/settings-service";

/** What the adapter hands `mountSettingsEditor`; the caller adds its own ids, chrome, clock and logger. */
type DeclarationEditorOptions = Pick<
	SettingsEditorOptions<unknown, never, string>,
	"fields" | "levels" | "initial" | "currentValue" | "displayValue" | "save" | "saveGroup" | "reset"
>;

/** A settings patch, keyed by field. */
type Patch = Readonly<Record<string, unknown>>;

/** What every hook of one screen reads and writes through. */
interface AdapterScope {
	readonly declaration: SettingsDeclaration;
	readonly service: SettingsService;
	readonly ctx: RequestContext;
	readonly translate: TranslateKey;
	readonly controls: ReadonlyMap<string, DeclarationControl>;
	readonly groups: ReadonlyMap<string, readonly DeclarationControl[]>;
}

/**
 * Build the settings-editor options of a declaration for one guild: its
 * fields and levels, the subject it opens on, and the hooks that read and
 * write through the settings service. The caller spreads the result into
 * `mountSettingsEditor` with its own `ids`, `chrome`, `clock` and `logger`.
 *
 * Every write goes through `service.set` as the administrator, so the screen
 * accepts and refuses exactly what every other surface does; a group's modal
 * is one write carrying only the members the administrator changed.
 *
 * @param declaration - the module's settings declaration.
 * @param service - the settings service the screen reads and writes through.
 * @param context - the guild, the administrator, their locale and the
 * translator of the texts shown in place of a value.
 * @returns the editor options, the initial subject read from the service.
 * @throws SettingsDeclarationError when a list holds an item kind lists cannot hold.
 */
export async function settingsEditorFromDeclaration<D extends SettingsDeclaration>(
	declaration: D,
	service: SettingsService,
	context: {
		readonly guildId: string;
		readonly userId: string;
		readonly locale: Locale;
		readonly translator: Translator;
	},
): Promise<DeclarationEditorOptions> {
	const { guildId, userId, locale, translator } = context;
	const controls = displayedControls(declaration);
	const layout = layoutDeclaration({ declaration, controls });
	const scope: AdapterScope = {
		declaration,
		service,
		ctx: { guildId, userId, locale },
		translate: (key) => translator.translate(locale, key),
		controls: new Map(controls.map((control) => [control.entry.key, control])),
		groups: layout.groups,
	};
	return {
		fields: layout.fields,
		levels: layout.levels,
		initial: await reload(scope),
		currentValue: (subject: DeclarationSubject, key: string) =>
			controlValue({ translate: scope.translate, subject, control: controlAt({ scope, key }) }),
		displayValue: (subject: DeclarationSubject, key: string) =>
			controlDisplay({ translate: scope.translate, subject, control: controlAt({ scope, key }) }),
		save: (subject: DeclarationSubject, key: string, submission: SettingsEditorSubmission) =>
			saveControl({ scope, subject, control: controlAt({ scope, key }), submission }),
		saveGroup: (
			subject: DeclarationSubject,
			groupKey: string,
			submissions: SettingsEditorGroupSubmission<string>,
		) => saveGroupControls({ scope, subject, groupKey, submissions }),
		reset: async () => {
			await service.reset(declaration, guildId, "all", scope.ctx);
			return reload(scope);
		},
	};
}

/** The controls of a declaration in its display order, the one every surface shows. */
function displayedControls(declaration: SettingsDeclaration): DeclarationControl[] {
	const rank = new Map(
		displayOrder(declaration)
			.entries.flatMap((entry) => (entry.kind === "field" ? [entry.key] : entry.fields))
			.map((key, index) => [key, index]),
	);
	const place = (control: DeclarationControl): number => rank.get(control.fieldKey) ?? rank.size;
	return declarationControls(declaration).sort((left, right) => place(left) - place(right));
}

/** The screen's subject, read back from the service. */
async function reload(
	scope: AdapterScope,
): Promise<SettingsEditorWrite<DeclarationSubject, never>> {
	const { declaration, service, ctx } = scope;
	return { subject: await loadDeclarationSubject({ declaration, service, ctx }), assets: [] };
}

/** Write `patch` in one `service.set` (nothing when it is empty), then read the screen back. */
async function write(params: {
	scope: AdapterScope;
	patch: Patch;
}): Promise<SettingsEditorWrite<DeclarationSubject, never>> {
	const { scope, patch } = params;
	if (Object.keys(patch).length > 0) {
		await scope.service.set(scope.declaration, scope.ctx.guildId, patch, scope.ctx);
	}
	return reload(scope);
}

function controlAt(params: { scope: AdapterScope; key: string }): DeclarationControl {
	const { scope, key } = params;
	const control = scope.controls.get(key);
	if (control === undefined) {
		throw new NotFoundError(`Settings screen of "${scope.declaration.id}" has no field "${key}"`);
	}
	return control;
}

/**
 * Save one entry as submitted. A secret opens on whether it is set, not on
 * its value: sent back untouched, that text must not replace the secret.
 */
function saveControl(params: {
	scope: AdapterScope;
	subject: DeclarationSubject;
	control: DeclarationControl;
	submission: SettingsEditorSubmission;
}): Promise<SettingsEditorWrite<DeclarationSubject, never>> {
	const { scope, subject, control, submission } = params;
	const untouchedSecret =
		control.shape.kind === "secret" &&
		isUnchanged({
			control,
			submission,
			current: controlValue({ translate: scope.translate, subject, control }),
		});
	const patch = untouchedSecret ? {} : withSubmission({ control, submission, subject, patch: {} });
	return write({ scope, patch });
}

/**
 * Save a group's modal in one write carrying only the members changed from
 * what the modal opened on: a picker whose stored entity is gone, or a
 * secret showing whether it is set, left untouched keeps its stored value.
 */
function saveGroupControls(params: {
	scope: AdapterScope;
	subject: DeclarationSubject;
	groupKey: string;
	submissions: SettingsEditorGroupSubmission<string>;
}): Promise<SettingsEditorWrite<DeclarationSubject, never>> {
	const { scope, subject, groupKey, submissions } = params;
	let patch: Patch = {};
	for (const control of scope.groups.get(groupKey) ?? []) {
		const submission: SettingsEditorGroupMemberSubmission | undefined =
			submissions[control.entry.key];
		const current = controlValue({ translate: scope.translate, subject, control });
		if (submission !== undefined && !isUnchanged({ control, submission, current })) {
			patch = withSubmission({ control, submission, subject, patch });
		}
	}
	return write({ scope, patch });
}
