import {
	type Attachment,
	ChannelSelectMenuBuilder,
	type ChannelType,
	CheckboxBuilder,
	FileUploadBuilder,
	LabelBuilder,
	ModalBuilder,
	type ModalSubmitInteraction,
	RoleSelectMenuBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	TextInputBuilder,
	TextInputStyle,
	UserSelectMenuBuilder,
} from "discord.js";

export type TextFieldStyleName = "short" | "paragraph";

const TEXT_FIELD_STYLES: Record<TextFieldStyleName, TextInputStyle> = {
	short: TextInputStyle.Short,
	paragraph: TextInputStyle.Paragraph,
};

/** Separates a modal's static id from the dynamic state appended for routing. */
const CUSTOM_ID_SEPARATOR = ":";

/**
 * A single text field. `required` defaults to Discord's own default (`true`); set
 * it to `false` to make {@link Modal.read} return `null` when left empty.
 */
export interface TextFieldDef {
	kind?: "text";
	label: string;
	/** Helper text rendered under the label. */
	description?: string;
	style?: TextFieldStyleName;
	required?: boolean;
	minLength?: number;
	maxLength?: number;
	placeholder?: string;
	/** Prefilled content, e.g. when editing an existing value. */
	value?: string;
}

/** A single checkbox field — always optional from Discord's own perspective. */
export interface CheckboxFieldDef {
	kind: "checkbox";
	label: string;
	/** Helper text rendered under the label. */
	description?: string;
	/** Pre-ticked state. Defaults to unticked. */
	default?: boolean;
}

/**
 * A single file upload. `required` defaults to Discord's own default (`true`);
 * set it to `false` to make {@link Modal.read} return `null` when nothing was
 * uploaded.
 */
export interface FileFieldDef {
	kind: "file";
	label: string;
	/** Helper text rendered under the label. */
	description?: string;
	required?: boolean;
	/** How many files may be uploaded at once. Discord's own default is one of each. */
	minValues?: number;
	maxValues?: number;
}

/** One choice offered by a {@link SelectFieldDef}. */
export interface SelectFieldOption {
	label: string;
	value: string;
	description?: string;
	default?: boolean;
}

/**
 * A single string select menu. `required` defaults to Discord's own default
 * (`true`); set it to `false` to make {@link Modal.read} return `null` when
 * nothing was picked.
 */
export interface SelectFieldDef {
	kind: "select";
	label: string;
	/** Helper text rendered under the label. */
	description?: string;
	options: readonly SelectFieldOption[];
	placeholder?: string;
	required?: boolean;
	minValues?: number;
	maxValues?: number;
}

/**
 * A single role select menu. `required` defaults to Discord's own default
 * (`true`); set it to `false` to make {@link Modal.read} return `null` when
 * nothing was picked.
 */
export interface RoleFieldDef {
	kind: "role";
	label: string;
	/** Helper text rendered under the label. */
	description?: string;
	defaultRoleIds?: readonly string[];
	placeholder?: string;
	required?: boolean;
	minValues?: number;
	maxValues?: number;
}

/**
 * A single user select menu. `required` defaults to Discord's own default
 * (`true`); set it to `false` to make {@link Modal.read} return `null` when
 * nothing was picked.
 */
export interface UserFieldDef {
	kind: "user";
	label: string;
	/** Helper text rendered under the label. */
	description?: string;
	defaultUserIds?: readonly string[];
	placeholder?: string;
	required?: boolean;
	minValues?: number;
	maxValues?: number;
}

/**
 * A single channel select menu. `required` defaults to Discord's own default
 * (`true`); set it to `false` to make {@link Modal.read} return `null` when
 * nothing was picked.
 */
export interface ChannelFieldDef {
	kind: "channel";
	label: string;
	/** Helper text rendered under the label. */
	description?: string;
	defaultChannelIds?: readonly string[];
	/** Restricts which channel kinds may be picked, e.g. to categories only. */
	channelTypes?: readonly ChannelType[];
	placeholder?: string;
	required?: boolean;
	minValues?: number;
	maxValues?: number;
}

export type FieldDef =
	| TextFieldDef
	| CheckboxFieldDef
	| FileFieldDef
	| SelectFieldDef
	| RoleFieldDef
	| UserFieldDef
	| ChannelFieldDef;

/** Field declarations keyed by custom id — the same key `read` returns values under. */
export type ModalFields = Record<string, FieldDef>;

/**
 * Submitted values, keyed like the declaration. A checkbox field always resolves
 * to a `boolean`; an optional text, file, select, role, user or channel field
 * widens to `| null` so a caller cannot forget the empty case. A file field's
 * uploads come back as a list because the field itself may allow several, and
 * so do a select/role/user/channel field's picks, as the identifiers chosen.
 * This only resolves correctly because `createModal` infers its fields as
 * `const`.
 */
export type ModalValues<F extends ModalFields> = {
	[K in keyof F]: F[K] extends CheckboxFieldDef
		? boolean
		: F[K] extends FileFieldDef
			? F[K]["required"] extends false
				? readonly Attachment[] | null
				: readonly Attachment[]
			: F[K] extends SelectFieldDef | RoleFieldDef | UserFieldDef | ChannelFieldDef
				? F[K]["required"] extends false
					? readonly string[] | null
					: readonly string[]
				: F[K] extends TextFieldDef
					? F[K]["required"] extends false
						? string | null
						: string
					: never;
};

export interface ModalDef<F extends ModalFields> {
	id: string;
	title: string;
	/**
	 * Text shown above the fields, via a Text Display component — a legend whose
	 * content is not one of the fields themselves. Counts toward the same
	 * five-component budget `fields` does: Discord's own modal object carries
	 * "between 1 and 5 (inclusive) components", label and text display alike.
	 */
	legend?: string;
	fields: F;
}

/**
 * Compiled modal: it knows how to render itself (`build`) and how to decode what
 * came back (`read`) — the same construction/behaviour pairing as a compiled
 * {@link import("@/discord/interaction/button").Button}. Without it a module
 * has to hand-roll raw discord.js builders, which the template forbids everywhere
 * else in the DSL.
 */
export interface Modal<F extends ModalFields> {
	readonly id: string;
	/**
	 * Build the modal to show. `state` is appended after a colon so the persistent
	 * {@link import("@/discord/components/component-router").ComponentRouter}
	 * still routes it to the handler registered under `id`.
	 */
	build(state?: string): ModalBuilder;
	read(interaction: ModalSubmitInteraction): ModalValues<F>;
}

function createTextInput(name: string, field: TextFieldDef): TextInputBuilder {
	const input = new TextInputBuilder()
		.setCustomId(name)
		.setStyle(TEXT_FIELD_STYLES[field.style ?? "short"])
		.setRequired(field.required ?? true);
	if (field.minLength !== undefined) {
		input.setMinLength(field.minLength);
	}
	if (field.maxLength !== undefined) {
		input.setMaxLength(field.maxLength);
	}
	if (field.placeholder !== undefined) {
		input.setPlaceholder(field.placeholder);
	}
	if (field.value !== undefined) {
		input.setValue(field.value);
	}
	return input;
}

function createFileUpload(name: string, field: FileFieldDef): FileUploadBuilder {
	const upload = new FileUploadBuilder().setCustomId(name).setRequired(field.required ?? true);
	if (field.minValues !== undefined) {
		upload.setMinValues(field.minValues);
	}
	if (field.maxValues !== undefined) {
		upload.setMaxValues(field.maxValues);
	}
	return upload;
}

function createSelectOption(option: SelectFieldOption): StringSelectMenuOptionBuilder {
	const built = new StringSelectMenuOptionBuilder()
		.setLabel(option.label)
		.setValue(option.value)
		.setDefault(option.default ?? false);
	if (option.description !== undefined) {
		built.setDescription(option.description);
	}
	return built;
}

function createStringSelect(name: string, field: SelectFieldDef): StringSelectMenuBuilder {
	const select = new StringSelectMenuBuilder()
		.setCustomId(name)
		.setRequired(field.required ?? true)
		.addOptions(field.options.map(createSelectOption));
	if (field.placeholder !== undefined) {
		select.setPlaceholder(field.placeholder);
	}
	if (field.minValues !== undefined) {
		select.setMinValues(field.minValues);
	}
	if (field.maxValues !== undefined) {
		select.setMaxValues(field.maxValues);
	}
	return select;
}

function createRoleSelect(name: string, field: RoleFieldDef): RoleSelectMenuBuilder {
	const select = new RoleSelectMenuBuilder().setCustomId(name).setRequired(field.required ?? true);
	if (field.defaultRoleIds !== undefined) {
		select.setDefaultRoles(...field.defaultRoleIds);
	}
	if (field.placeholder !== undefined) {
		select.setPlaceholder(field.placeholder);
	}
	if (field.minValues !== undefined) {
		select.setMinValues(field.minValues);
	}
	if (field.maxValues !== undefined) {
		select.setMaxValues(field.maxValues);
	}
	return select;
}

function createUserSelect(name: string, field: UserFieldDef): UserSelectMenuBuilder {
	const select = new UserSelectMenuBuilder().setCustomId(name).setRequired(field.required ?? true);
	if (field.defaultUserIds !== undefined) {
		select.setDefaultUsers(...field.defaultUserIds);
	}
	if (field.placeholder !== undefined) {
		select.setPlaceholder(field.placeholder);
	}
	if (field.minValues !== undefined) {
		select.setMinValues(field.minValues);
	}
	if (field.maxValues !== undefined) {
		select.setMaxValues(field.maxValues);
	}
	return select;
}

function createChannelSelect(name: string, field: ChannelFieldDef): ChannelSelectMenuBuilder {
	const select = new ChannelSelectMenuBuilder()
		.setCustomId(name)
		.setRequired(field.required ?? true);
	if (field.channelTypes !== undefined) {
		select.setChannelTypes(...field.channelTypes);
	}
	if (field.defaultChannelIds !== undefined) {
		select.setDefaultChannels(...field.defaultChannelIds);
	}
	if (field.placeholder !== undefined) {
		select.setPlaceholder(field.placeholder);
	}
	if (field.minValues !== undefined) {
		select.setMinValues(field.minValues);
	}
	if (field.maxValues !== undefined) {
		select.setMaxValues(field.maxValues);
	}
	return select;
}

function createLabel(name: string, field: FieldDef): LabelBuilder {
	const label = new LabelBuilder().setLabel(field.label);
	if (field.description !== undefined) {
		label.setDescription(field.description);
	}
	if (field.kind === "checkbox") {
		return label.setCheckboxComponent(
			new CheckboxBuilder().setCustomId(name).setDefault(field.default ?? false),
		);
	}
	if (field.kind === "file") {
		return label.setFileUploadComponent(createFileUpload(name, field));
	}
	if (field.kind === "select") {
		return label.setStringSelectMenuComponent(createStringSelect(name, field));
	}
	if (field.kind === "role") {
		return label.setRoleSelectMenuComponent(createRoleSelect(name, field));
	}
	if (field.kind === "user") {
		return label.setUserSelectMenuComponent(createUserSelect(name, field));
	}
	if (field.kind === "channel") {
		return label.setChannelSelectMenuComponent(createChannelSelect(name, field));
	}
	return label.setTextInputComponent(createTextInput(name, field));
}

/**
 * An optional field left blank comes back as an empty string (or not at all when
 * Discord omits it), two shapes for the same "nothing entered" outcome — collapse
 * both to `null` so callers branch once.
 */
function readOptionalField(interaction: ModalSubmitInteraction, name: string): string | null {
	if (!interaction.fields.fields.has(name)) {
		return null;
	}
	const value = interaction.fields.getTextInputValue(name);
	return value.length > 0 ? value : null;
}

/**
 * The same "nothing entered" collapsing for an upload: an optional file field
 * left alone comes back absent, or present with no attachment at all.
 */
function readOptionalFiles(
	interaction: ModalSubmitInteraction,
	name: string,
): readonly Attachment[] | null {
	if (!interaction.fields.fields.has(name)) {
		return null;
	}
	const uploaded = interaction.fields.getUploadedFiles(name);
	if (uploaded === null || uploaded.size === 0) {
		return null;
	}
	return [...uploaded.values()];
}

/**
 * The same "nothing entered" collapsing for a string select: an optional select
 * field left alone comes back absent, or present with no option chosen.
 */
function readOptionalSelectValues(
	interaction: ModalSubmitInteraction,
	name: string,
): readonly string[] | null {
	if (!interaction.fields.fields.has(name)) {
		return null;
	}
	const values = interaction.fields.getStringSelectValues(name);
	return values.length > 0 ? values : null;
}

/**
 * The same "nothing entered" collapsing for a role/user/channel select: an
 * optional field left alone comes back absent, or present with an empty (or
 * `null`) selection. The identifiers are returned as the keys of the
 * `Collection` the underlying getter resolves.
 */
function readOptionalIds(
	interaction: ModalSubmitInteraction,
	name: string,
	getSelected: (
		interaction: ModalSubmitInteraction,
		name: string,
	) => ReadonlyMap<string, unknown> | null,
): readonly string[] | null {
	if (!interaction.fields.fields.has(name)) {
		return null;
	}
	const selected = getSelected(interaction, name);
	if (selected === null || selected.size === 0) {
		return null;
	}
	return [...selected.keys()];
}

/**
 * Declare a modal: a title, a custom id and typed fields (text, checkbox,
 * file, select, role, user or channel).
 *
 * Discord caps a modal at five components, so keep `fields` — plus one more if
 * `legend` is set — within that budget. The `const` type parameter is what
 * preserves each field's literal `kind`/`required`, and therefore the shape of
 * the values `read` returns.
 */
export function createModal<const F extends ModalFields>(def: ModalDef<F>): Modal<F> {
	const entries = Object.entries(def.fields) as [keyof F & string, FieldDef][];

	return {
		id: def.id,
		build(state) {
			const customId = state === undefined ? def.id : `${def.id}${CUSTOM_ID_SEPARATOR}${state}`;
			const modal = new ModalBuilder().setCustomId(customId).setTitle(def.title);
			if (def.legend !== undefined) {
				modal.addTextDisplayComponents((textDisplay) =>
					textDisplay.setContent(def.legend as string),
				);
			}
			return modal.addLabelComponents(...entries.map(([name, field]) => createLabel(name, field)));
		},
		read(interaction) {
			const values = {} as Record<
				string,
				string | null | boolean | readonly Attachment[] | readonly string[]
			>;
			for (const [name, field] of entries) {
				if (field.kind === "checkbox") {
					values[name] = interaction.fields.getCheckbox(name);
					continue;
				}
				const isRequired = field.required ?? true;
				if (field.kind === "file") {
					values[name] = isRequired
						? [...interaction.fields.getUploadedFiles(name, true).values()]
						: readOptionalFiles(interaction, name);
					continue;
				}
				if (field.kind === "select") {
					values[name] = isRequired
						? interaction.fields.getStringSelectValues(name)
						: readOptionalSelectValues(interaction, name);
					continue;
				}
				if (field.kind === "role") {
					values[name] = isRequired
						? [...interaction.fields.getSelectedRoles(name, true).keys()]
						: readOptionalIds(interaction, name, (i, n) => i.fields.getSelectedRoles(n, false));
					continue;
				}
				if (field.kind === "user") {
					values[name] = isRequired
						? [...interaction.fields.getSelectedUsers(name, true).keys()]
						: readOptionalIds(interaction, name, (i, n) => i.fields.getSelectedUsers(n, false));
					continue;
				}
				if (field.kind === "channel") {
					values[name] = isRequired
						? [...interaction.fields.getSelectedChannels(name, true).keys()]
						: readOptionalIds(interaction, name, (i, n) => i.fields.getSelectedChannels(n, false));
					continue;
				}
				values[name] = isRequired
					? interaction.fields.getTextInputValue(name)
					: readOptionalField(interaction, name);
			}
			return values as ModalValues<F>;
		},
	};
}
