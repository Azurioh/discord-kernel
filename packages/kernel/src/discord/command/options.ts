import type {
	ApplicationCommandOptionAllowedChannelTypes,
	Attachment,
	AutocompleteInteraction,
	ChannelType,
	ChatInputCommandInteraction,
	GuildBasedChannel,
	LocalizationMap,
	Role,
	SlashCommandAttachmentOption,
	SlashCommandBooleanOption,
	SlashCommandChannelOption,
	SlashCommandIntegerOption,
	SlashCommandMentionableOption,
	SlashCommandNumberOption,
	SlashCommandRoleOption,
	SlashCommandStringOption,
	SlashCommandUserOption,
	User,
} from "discord.js";
import { isValidWallClock } from "@/datetime";
import { OptionValidationError } from "@/discord/command/errors";
import type { Choice } from "@/settings/choice";

/**
 * Translated name/description for a single option, keyed by Discord locale
 * (e.g. `{ nameLocalizations: { "en-US": "channel", "en-GB": "channel" } }`).
 * Every `create*Option` factory accepts this so an option's picker label can be
 * localised the same way a command/subcommand name already can.
 */
export interface OptionLocalizations {
	nameLocalizations?: LocalizationMap;
	descriptionLocalizations?: LocalizationMap;
}

/** The setters every discord.js option builder shares, whatever its type. */
interface OptionBuilder {
	setName(name: string): unknown;
	setDescription(description: string): unknown;
	setRequired(required: boolean): unknown;
	setNameLocalizations(map: LocalizationMap): unknown;
	setDescriptionLocalizations(map: LocalizationMap): unknown;
}

/**
 * The block every option type opens with: its name, description, whether it
 * is required, and its translated labels.
 */
function describeOption(
	option: OptionBuilder,
	name: string,
	declared: { readonly description: string; readonly isRequired: boolean },
	localizations: OptionLocalizations,
): void {
	option.setName(name);
	option.setDescription(declared.description);
	option.setRequired(declared.isRequired);
	if (localizations.nameLocalizations) {
		option.setNameLocalizations(localizations.nameLocalizations);
	}
	if (localizations.descriptionLocalizations) {
		option.setDescriptionLocalizations(localizations.descriptionLocalizations);
	}
}

/**
 * The subset of a discord.js builder an option needs to register itself.
 * Both `SlashCommandBuilder` (flat commands) and `SlashCommandSubcommandBuilder`
 * satisfy this structurally, so the same option works on either.
 */
export interface OptionContainer {
	addStringOption(input: (option: SlashCommandStringOption) => SlashCommandStringOption): unknown;
	addUserOption(input: (option: SlashCommandUserOption) => SlashCommandUserOption): unknown;
	addBooleanOption(
		input: (option: SlashCommandBooleanOption) => SlashCommandBooleanOption,
	): unknown;
	addIntegerOption(
		input: (option: SlashCommandIntegerOption) => SlashCommandIntegerOption,
	): unknown;
	addNumberOption(input: (option: SlashCommandNumberOption) => SlashCommandNumberOption): unknown;
	addChannelOption(
		input: (option: SlashCommandChannelOption) => SlashCommandChannelOption,
	): unknown;
	addRoleOption(input: (option: SlashCommandRoleOption) => SlashCommandRoleOption): unknown;
	addMentionableOption(
		input: (option: SlashCommandMentionableOption) => SlashCommandMentionableOption,
	): unknown;
	addAttachmentOption(
		input: (option: SlashCommandAttachmentOption) => SlashCommandAttachmentOption,
	): unknown;
}

/**
 * Computes the suggestions for a focused option. Sync resolvers are allowed so a
 * static list does not have to pay for a promise.
 */
export type AutocompleteResolver = (
	interaction: AutocompleteInteraction,
) => Promise<readonly Choice[]> | readonly Choice[];

export interface Option<TValue, TRequired extends boolean> {
	readonly description: string;
	readonly isRequired: TRequired;
	/** Present only on the option types Discord lets us autocomplete. */
	readonly autocomplete?: AutocompleteResolver;
	required(): Option<TValue, true>;
	choices<const C extends readonly TValue[]>(values: C): Option<C[number], TRequired>;
	apply(container: OptionContainer, name: string): void;
	read(
		interaction: ChatInputCommandInteraction,
		name: string,
	): TRequired extends true ? TValue : TValue | null;
}

/**
 * The option types Discord accepts `autocomplete` on (string, integer, number).
 * `required()` is narrowed so `.withAutocomplete()` stays reachable after it,
 * while `choices()` deliberately falls back to a plain `Option`: Discord forbids
 * combining both, so the illegal chain is unrepresentable rather than merely
 * rejected at registration.
 */
export interface AutocompletableOption<TValue, TRequired extends boolean>
	extends Option<TValue, TRequired> {
	required(): AutocompletableOption<TValue, true>;
	withAutocomplete(resolver: AutocompleteResolver): AutocompletableOption<TValue, TRequired>;
}

// `Values<O>` only resolves required-ness correctly when `O` is inferred from an
// options literal. Annotating a variable as `Options` erases the `true`/`false`
// literals, so always let inference flow (e.g. through `createSubCommand()`), never annotate `: Options`.
export type Options = Record<string, Option<unknown, boolean>>;

export type Values<O extends Options> = {
	[K in keyof O]: O[K] extends Option<infer V, infer R> ? (R extends true ? V : V | null) : never;
};

const CHOICES_WITH_AUTOCOMPLETE_MESSAGE =
	"An option cannot declare both `choices` and `autocomplete`; Discord rejects the command.";

/**
 * Discord refuses a command whose option carries both a static choice list and
 * an autocomplete resolver, so fail at registration rather than at deploy time.
 */
function assertChoicesAndAutocompleteExclusive(
	hasChoices: boolean,
	resolver: AutocompleteResolver | undefined,
): void {
	if (hasChoices && resolver !== undefined) {
		throw new OptionValidationError(CHOICES_WITH_AUTOCOMPLETE_MESSAGE);
	}
}

/** Length limits for a string option, mirroring the numeric bounds below. */
interface StringLengthBounds {
	minLength?: number;
	maxLength?: number;
}

class StringOption<TValue extends string, TRequired extends boolean>
	implements AutocompletableOption<TValue, TRequired>
{
	constructor(
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly choiceValues: readonly TValue[] | null,
		private readonly validator: ((value: string) => void) | null,
		private readonly bounds: StringLengthBounds,
		readonly autocomplete?: AutocompleteResolver,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): AutocompletableOption<TValue, true> {
		return new StringOption<TValue, true>(
			this.description,
			true,
			this.choiceValues,
			this.validator,
			this.bounds,
			this.autocomplete,
			this.localizations,
		);
	}

	choices<const C extends readonly TValue[]>(values: C): Option<C[number], TRequired> {
		return new StringOption<C[number] & string, TRequired>(
			this.description,
			this.isRequired,
			values as readonly (C[number] & string)[],
			this.validator,
			this.bounds,
			this.autocomplete,
			this.localizations,
		) as unknown as Option<C[number], TRequired>;
	}

	withAutocomplete(resolver: AutocompleteResolver): AutocompletableOption<TValue, TRequired> {
		return new StringOption<TValue, TRequired>(
			this.description,
			this.isRequired,
			this.choiceValues,
			this.validator,
			this.bounds,
			resolver,
			this.localizations,
		);
	}

	apply(container: OptionContainer, name: string): void {
		assertChoicesAndAutocompleteExclusive(this.choiceValues !== null, this.autocomplete);
		container.addStringOption((option) => {
			describeOption(option, name, this, this.localizations);
			if (this.choiceValues) {
				option.addChoices(...this.choiceValues.map((value) => ({ name: value, value })));
			}
			if (this.bounds.minLength !== undefined) {
				option.setMinLength(this.bounds.minLength);
			}
			if (this.bounds.maxLength !== undefined) {
				option.setMaxLength(this.bounds.maxLength);
			}
			if (this.autocomplete !== undefined) {
				option.setAutocomplete(true);
			}
			return option;
		});
	}

	read(
		interaction: ChatInputCommandInteraction,
		name: string,
	): TRequired extends true ? TValue : TValue | null {
		const raw = interaction.options.getString(name, this.isRequired as boolean);
		if (raw !== null && this.validator) {
			this.validator(raw);
		}
		return raw as TRequired extends true ? TValue : TValue | null;
	}
}

export function createStringOption(
	description: string,
	bounds: StringLengthBounds = {},
	localizations: OptionLocalizations = {},
): AutocompletableOption<string, false> {
	return new StringOption<string, false>(
		description,
		false,
		null,
		null,
		bounds,
		undefined,
		localizations,
	);
}

/**
 * What an option type contributes on top of the shared name/description/
 * required/localization block: which builder it registers through (and any
 * extra setter it applies there), how it reads the submitted value, and the
 * name its `choices()` refusal gives it.
 */
interface OptionKind<TValue, TBuilder> {
	readonly label: string;
	add(container: OptionContainer, configure: (option: TBuilder) => void): void;
	read(interaction: ChatInputCommandInteraction, name: string, required: boolean): TValue | null;
}

/** Adapt a `configure` step to the builder callback discord.js expects back. */
function configuring<TBase>(
	configure: (option: TBase) => void,
): <TBuilder extends TBase>(option: TBuilder) => TBuilder {
	return (option) => {
		configure(option);
		return option;
	};
}

/**
 * An option type that supports neither choices nor autocomplete: every
 * difference between two of them lives in their {@link OptionKind}.
 */
class PlainOption<TValue, TRequired extends boolean> implements Option<TValue, TRequired> {
	constructor(
		private readonly kind: OptionKind<TValue, OptionBuilder>,
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): Option<TValue, true> {
		return new PlainOption<TValue, true>(this.kind, this.description, true, this.localizations);
	}

	choices<const C extends readonly TValue[]>(_values: C): Option<C[number], TRequired> {
		throw new OptionValidationError(`${this.kind.label} options do not support choices.`);
	}

	apply(container: OptionContainer, name: string): void {
		this.kind.add(container, (option) => describeOption(option, name, this, this.localizations));
	}

	read(
		interaction: ChatInputCommandInteraction,
		name: string,
	): TRequired extends true ? TValue : TValue | null {
		return this.kind.read(interaction, name, this.isRequired) as TRequired extends true
			? TValue
			: TValue | null;
	}
}

const USER_KIND: OptionKind<User, OptionBuilder> = {
	label: "User",
	add: (container, configure) => container.addUserOption(configuring(configure)),
	read: (interaction, name, required) => interaction.options.getUser(name, required),
};

export function createUserOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<User, false> {
	return new PlainOption<User, false>(USER_KIND, description, false, localizations);
}

const BOOLEAN_KIND: OptionKind<boolean, OptionBuilder> = {
	label: "Boolean",
	add: (container, configure) => container.addBooleanOption(configuring(configure)),
	read: (interaction, name, required) => interaction.options.getBoolean(name, required),
};

export function createBooleanOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<boolean, false> {
	return new PlainOption<boolean, false>(BOOLEAN_KIND, description, false, localizations);
}

interface IntegerBounds {
	min?: number;
	max?: number;
}

/** The setters the integer and number builders share on top of the plain ones. */
interface NumericOptionBuilder extends OptionBuilder {
	setMinValue(min: number): unknown;
	setMaxValue(max: number): unknown;
	setAutocomplete(autocomplete: boolean): unknown;
}

/**
 * An integer or a number option: bounded, autocompletable, never offered as a
 * fixed choice list. The two differ only in their {@link OptionKind}.
 */
class NumericOption<TRequired extends boolean> implements AutocompletableOption<number, TRequired> {
	constructor(
		private readonly kind: OptionKind<number, NumericOptionBuilder>,
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly bounds: IntegerBounds,
		readonly autocomplete?: AutocompleteResolver,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): AutocompletableOption<number, true> {
		return new NumericOption<true>(
			this.kind,
			this.description,
			true,
			this.bounds,
			this.autocomplete,
			this.localizations,
		);
	}

	choices<const C extends readonly number[]>(_values: C): Option<C[number], TRequired> {
		throw new OptionValidationError(`${this.kind.label} options do not support choices.`);
	}

	withAutocomplete(resolver: AutocompleteResolver): AutocompletableOption<number, TRequired> {
		return new NumericOption<TRequired>(
			this.kind,
			this.description,
			this.isRequired,
			this.bounds,
			resolver,
			this.localizations,
		);
	}

	apply(container: OptionContainer, name: string): void {
		this.kind.add(container, (option) => {
			describeOption(option, name, this, this.localizations);
			if (this.bounds.min !== undefined) {
				option.setMinValue(this.bounds.min);
			}
			if (this.bounds.max !== undefined) {
				option.setMaxValue(this.bounds.max);
			}
			if (this.autocomplete !== undefined) {
				option.setAutocomplete(true);
			}
		});
	}

	read(
		interaction: ChatInputCommandInteraction,
		name: string,
	): TRequired extends true ? number : number | null {
		return this.kind.read(interaction, name, this.isRequired) as TRequired extends true
			? number
			: number | null;
	}
}

const INTEGER_KIND: OptionKind<number, NumericOptionBuilder> = {
	label: "Integer",
	add: (container, configure) => container.addIntegerOption(configuring(configure)),
	read: (interaction, name, required) => interaction.options.getInteger(name, required),
};

export function createIntegerOption(
	description: string,
	bounds: IntegerBounds = {},
	localizations: OptionLocalizations = {},
): AutocompletableOption<number, false> {
	return new NumericOption<false>(
		INTEGER_KIND,
		description,
		false,
		bounds,
		undefined,
		localizations,
	);
}

const NUMBER_KIND: OptionKind<number, NumericOptionBuilder> = {
	label: "Number",
	add: (container, configure) => container.addNumberOption(configuring(configure)),
	read: (interaction, name, required) => interaction.options.getNumber(name, required),
};

export function createNumberOption(
	description: string,
	bounds: IntegerBounds = {},
	localizations: OptionLocalizations = {},
): AutocompletableOption<number, false> {
	return new NumericOption<false>(
		NUMBER_KIND,
		description,
		false,
		bounds,
		undefined,
		localizations,
	);
}

/** A plain string input whose raw text is validated, then converted, by `parse`. */
function textKind<TValue>(
	label: string,
	parse: (raw: string) => TValue,
): OptionKind<TValue, OptionBuilder> {
	return {
		label,
		add: (container, configure) => container.addStringOption(configuring(configure)),
		read: (interaction, name, required) => {
			const raw = interaction.options.getString(name, required);
			return raw === null ? null : parse(raw);
		},
	};
}

const INVALID_DATETIME_MESSAGE =
	"Invalid date format. Use `YYYY-MM-DD HH:MM` (e.g. `2025-03-15 14:00`).";

const DATE_TIME_KIND = textKind<Date>("Date", (raw) => {
	if (Number.isNaN(Date.parse(raw))) {
		throw new OptionValidationError(INVALID_DATETIME_MESSAGE);
	}
	return new Date(raw.replace(" ", "T"));
});

export function createDateTimeOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<Date, false> {
	return new PlainOption<Date, false>(DATE_TIME_KIND, description, false, localizations);
}

const INVALID_WALL_CLOCK_MESSAGE =
	"Invalid date format. Use `YYYY-MM-DD` or `YYYY-MM-DD HH:MM` (e.g. `2025-03-15 14:00`).";
const INVALID_DATE_ONLY_MESSAGE = "Invalid date format. Use `YYYY-MM-DD` (e.g. `2025-03-15`).";
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A raw `YYYY-MM-DD[ HH:MM[:SS]]` string, validated but *not* anchored to any
 * timezone here — the core has no notion of "the guild's timezone", so
 * anchoring (`zonedWallClockToUtc`) is the caller's job, once it knows which
 * IANA zone applies. This is what lets the same option be reused by any module
 * that needs a wall-clock input.
 */
const WALL_CLOCK_KIND = textKind<string>("Wall-clock", (raw) => {
	if (!isValidWallClock(raw)) {
		throw new OptionValidationError(INVALID_WALL_CLOCK_MESSAGE);
	}
	return raw;
});

/**
 * A `YYYY-MM-DD[ HH:MM[:SS]]` string option, validated against the wall-clock
 * grammar but left unanchored (no `Date` conversion, no assumed timezone) — the
 * caller anchors it with `zonedWallClockToUtc` once it knows the guild zone.
 */
export function createWallClockOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<string, false> {
	return new PlainOption<string, false>(WALL_CLOCK_KIND, description, false, localizations);
}

/** A strict, date-only (`YYYY-MM-DD`) option — rejects any time component. */
const DATE_KIND = textKind<Date>("Date", (raw) => {
	// Strict `YYYY-MM-DD` with a real-calendar check (rejects `2026/03/15`,
	// time-bearing input, and impossible dates like `2026-02-30`).
	if (!DATE_ONLY_PATTERN.test(raw) || !isValidWallClock(raw)) {
		throw new OptionValidationError(INVALID_DATE_ONLY_MESSAGE);
	}
	return new Date(raw);
});

/**
 * A strict date-only (`YYYY-MM-DD`) option. The returned `Date` is UTC
 * midnight of that calendar day — a caller that needs it anchored to a guild
 * timezone (start/end of that guild-local day) uses `startOfGuildDay`/
 * `endOfGuildDay` from `core/datetime`.
 */
export function createDateOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<Date, false> {
	return new PlainOption<Date, false>(DATE_KIND, description, false, localizations);
}

/** The channel types Discord accepts on a channel option (guild channels only). */
type AllowedChannelType = ApplicationCommandOptionAllowedChannelTypes;

/**
 * Narrows the guild channel union to the declared channel types, mirroring the
 * `Extract<>` mapping of `CommandInteractionOptionResolver.getChannel`. The
 * thread ternary is load-bearing: `PublicThreadChannel.type` is
 * `PublicThread | AnnouncementThread`, so extracting on a single one of them
 * would collapse to `never`.
 */
export type ChannelOptionValue<TType extends AllowedChannelType> = Extract<
	GuildBasedChannel,
	{
		type: TType extends ChannelType.PublicThread | ChannelType.AnnouncementThread
			? ChannelType.PublicThread | ChannelType.AnnouncementThread
			: TType;
	}
>;

function channelKind<TType extends AllowedChannelType>(
	channelTypes: readonly TType[] | undefined,
): OptionKind<ChannelOptionValue<TType>, OptionBuilder> {
	return {
		label: "Channel",
		add: (container, configure) =>
			container.addChannelOption((option) => {
				configure(option);
				if (channelTypes !== undefined) {
					option.addChannelTypes(...channelTypes);
				}
				return option;
			}),
		// The declared types are re-sent at read time: `addChannelTypes` only drives
		// the client-side picker, so Discord can still deliver another channel kind.
		read: (interaction, name, required) =>
			interaction.options.getChannel(
				name,
				required,
				channelTypes,
			) as ChannelOptionValue<TType> | null,
	};
}

export function createChannelOption<const TType extends AllowedChannelType = AllowedChannelType>(
	description: string,
	channelTypes?: readonly TType[],
	localizations: OptionLocalizations = {},
): Option<ChannelOptionValue<TType>, false> {
	return new PlainOption<ChannelOptionValue<TType>, false>(
		channelKind(channelTypes),
		description,
		false,
		localizations,
	);
}

const ROLE_KIND: OptionKind<Role, OptionBuilder> = {
	label: "Role",
	add: (container, configure) => container.addRoleOption(configuring(configure)),
	read: (interaction, name, required) => interaction.options.getRole(name, required) as Role | null,
};

export function createRoleOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<Role, false> {
	return new PlainOption<Role, false>(ROLE_KIND, description, false, localizations);
}

const MENTIONABLE_KIND: OptionKind<Role | User, OptionBuilder> = {
	label: "Mentionable",
	add: (container, configure) => container.addMentionableOption(configuring(configure)),
	read: (interaction, name, required) =>
		interaction.options.getMentionable(name, required) as Role | User | null,
};

export function createMentionableOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<Role | User, false> {
	return new PlainOption<Role | User, false>(MENTIONABLE_KIND, description, false, localizations);
}

const ATTACHMENT_KIND: OptionKind<Attachment, OptionBuilder> = {
	label: "Attachment",
	add: (container, configure) => container.addAttachmentOption(configuring(configure)),
	read: (interaction, name, required) => interaction.options.getAttachment(name, required),
};

export function createAttachmentOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<Attachment, false> {
	return new PlainOption<Attachment, false>(ATTACHMENT_KIND, description, false, localizations);
}
