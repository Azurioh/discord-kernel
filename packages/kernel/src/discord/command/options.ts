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

/** Applies the localization maps to a builder, if any were provided. */
function applyOptionLocalizations(
	option: {
		setNameLocalizations(map: LocalizationMap): unknown;
		setDescriptionLocalizations(map: LocalizationMap): unknown;
	},
	localizations: OptionLocalizations,
): void {
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
			option.setName(name).setDescription(this.description).setRequired(this.isRequired);
			applyOptionLocalizations(option, this.localizations);
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

class UserOption<TRequired extends boolean> implements Option<User, TRequired> {
	constructor(
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): Option<User, true> {
		return new UserOption<true>(this.description, true, this.localizations);
	}

	choices<const C extends readonly User[]>(_values: C): Option<C[number], TRequired> {
		throw new OptionValidationError("User options do not support choices.");
	}

	apply(container: OptionContainer, name: string): void {
		container.addUserOption((option) => {
			option.setName(name).setDescription(this.description).setRequired(this.isRequired);
			applyOptionLocalizations(option, this.localizations);
			return option;
		});
	}

	read(
		interaction: ChatInputCommandInteraction,
		name: string,
	): TRequired extends true ? User : User | null {
		return interaction.options.getUser(name, this.isRequired as boolean) as TRequired extends true
			? User
			: User | null;
	}
}

export function createUserOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<User, false> {
	return new UserOption<false>(description, false, localizations);
}

class BooleanOption<TRequired extends boolean> implements Option<boolean, TRequired> {
	constructor(
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): Option<boolean, true> {
		return new BooleanOption<true>(this.description, true, this.localizations);
	}

	choices<const C extends readonly boolean[]>(_values: C): Option<C[number], TRequired> {
		throw new OptionValidationError("Boolean options do not support choices.");
	}

	apply(container: OptionContainer, name: string): void {
		container.addBooleanOption((option) => {
			option.setName(name).setDescription(this.description).setRequired(this.isRequired);
			applyOptionLocalizations(option, this.localizations);
			return option;
		});
	}

	read(
		interaction: ChatInputCommandInteraction,
		name: string,
	): TRequired extends true ? boolean : boolean | null {
		return interaction.options.getBoolean(
			name,
			this.isRequired as boolean,
		) as TRequired extends true ? boolean : boolean | null;
	}
}

export function createBooleanOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<boolean, false> {
	return new BooleanOption<false>(description, false, localizations);
}

interface IntegerBounds {
	min?: number;
	max?: number;
}

class IntegerOption<TRequired extends boolean> implements AutocompletableOption<number, TRequired> {
	constructor(
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly bounds: IntegerBounds,
		readonly autocomplete?: AutocompleteResolver,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): AutocompletableOption<number, true> {
		return new IntegerOption<true>(
			this.description,
			true,
			this.bounds,
			this.autocomplete,
			this.localizations,
		);
	}

	choices<const C extends readonly number[]>(_values: C): Option<C[number], TRequired> {
		throw new OptionValidationError("Integer options do not support choices.");
	}

	withAutocomplete(resolver: AutocompleteResolver): AutocompletableOption<number, TRequired> {
		return new IntegerOption<TRequired>(
			this.description,
			this.isRequired,
			this.bounds,
			resolver,
			this.localizations,
		);
	}

	apply(container: OptionContainer, name: string): void {
		container.addIntegerOption((option) => {
			option.setName(name).setDescription(this.description).setRequired(this.isRequired);
			applyOptionLocalizations(option, this.localizations);
			if (this.bounds.min !== undefined) {
				option.setMinValue(this.bounds.min);
			}
			if (this.bounds.max !== undefined) {
				option.setMaxValue(this.bounds.max);
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
	): TRequired extends true ? number : number | null {
		return interaction.options.getInteger(
			name,
			this.isRequired as boolean,
		) as TRequired extends true ? number : number | null;
	}
}

export function createIntegerOption(
	description: string,
	bounds: IntegerBounds = {},
	localizations: OptionLocalizations = {},
): AutocompletableOption<number, false> {
	return new IntegerOption<false>(description, false, bounds, undefined, localizations);
}

class NumberOption<TRequired extends boolean> implements AutocompletableOption<number, TRequired> {
	constructor(
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly bounds: IntegerBounds,
		readonly autocomplete?: AutocompleteResolver,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): AutocompletableOption<number, true> {
		return new NumberOption<true>(
			this.description,
			true,
			this.bounds,
			this.autocomplete,
			this.localizations,
		);
	}

	choices<const C extends readonly number[]>(_values: C): Option<C[number], TRequired> {
		throw new OptionValidationError("Number options do not support choices.");
	}

	withAutocomplete(resolver: AutocompleteResolver): AutocompletableOption<number, TRequired> {
		return new NumberOption<TRequired>(
			this.description,
			this.isRequired,
			this.bounds,
			resolver,
			this.localizations,
		);
	}

	apply(container: OptionContainer, name: string): void {
		container.addNumberOption((option) => {
			option.setName(name).setDescription(this.description).setRequired(this.isRequired);
			applyOptionLocalizations(option, this.localizations);
			if (this.bounds.min !== undefined) {
				option.setMinValue(this.bounds.min);
			}
			if (this.bounds.max !== undefined) {
				option.setMaxValue(this.bounds.max);
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
	): TRequired extends true ? number : number | null {
		return interaction.options.getNumber(name, this.isRequired as boolean) as TRequired extends true
			? number
			: number | null;
	}
}

export function createNumberOption(
	description: string,
	bounds: IntegerBounds = {},
	localizations: OptionLocalizations = {},
): AutocompletableOption<number, false> {
	return new NumberOption<false>(description, false, bounds, undefined, localizations);
}

const INVALID_DATETIME_MESSAGE =
	"Invalid date format. Use `YYYY-MM-DD HH:MM` (e.g. `2025-03-15 14:00`).";

function assertValidDate(value: string, message: string): void {
	if (Number.isNaN(Date.parse(value))) {
		throw new OptionValidationError(message);
	}
}

class DateTimeOption<TRequired extends boolean> implements Option<Date, TRequired> {
	constructor(
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): Option<Date, true> {
		return new DateTimeOption<true>(this.description, true, this.localizations);
	}

	choices<const C extends readonly Date[]>(_values: C): Option<C[number], TRequired> {
		throw new OptionValidationError("Date options do not support choices.");
	}

	apply(container: OptionContainer, name: string): void {
		container.addStringOption((option) => {
			option.setName(name).setDescription(this.description).setRequired(this.isRequired);
			applyOptionLocalizations(option, this.localizations);
			return option;
		});
	}

	read(
		interaction: ChatInputCommandInteraction,
		name: string,
	): TRequired extends true ? Date : Date | null {
		const raw = interaction.options.getString(name, this.isRequired as boolean);
		if (raw === null) {
			return null as TRequired extends true ? Date : Date | null;
		}
		assertValidDate(raw, INVALID_DATETIME_MESSAGE);
		return new Date(raw.replace(" ", "T")) as TRequired extends true ? Date : Date | null;
	}
}

export function createDateTimeOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<Date, false> {
	return new DateTimeOption<false>(description, false, localizations);
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
class WallClockOption<TRequired extends boolean> implements Option<string, TRequired> {
	constructor(
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): Option<string, true> {
		return new WallClockOption<true>(this.description, true, this.localizations);
	}

	choices<const C extends readonly string[]>(_values: C): Option<C[number], TRequired> {
		throw new OptionValidationError("Wall-clock options do not support choices.");
	}

	apply(container: OptionContainer, name: string): void {
		container.addStringOption((option) => {
			option.setName(name).setDescription(this.description).setRequired(this.isRequired);
			applyOptionLocalizations(option, this.localizations);
			return option;
		});
	}

	read(
		interaction: ChatInputCommandInteraction,
		name: string,
	): TRequired extends true ? string : string | null {
		const raw = interaction.options.getString(name, this.isRequired as boolean);
		if (raw === null) {
			return null as TRequired extends true ? string : string | null;
		}
		if (!isValidWallClock(raw)) {
			throw new OptionValidationError(INVALID_WALL_CLOCK_MESSAGE);
		}
		return raw as TRequired extends true ? string : string | null;
	}
}

/**
 * A `YYYY-MM-DD[ HH:MM[:SS]]` string option, validated against the wall-clock
 * grammar but left unanchored (no `Date` conversion, no assumed timezone) — the
 * caller anchors it with `zonedWallClockToUtc` once it knows the guild zone.
 */
export function createWallClockOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<string, false> {
	return new WallClockOption<false>(description, false, localizations);
}

/** A strict, date-only (`YYYY-MM-DD`) option — rejects any time component. */
class DateOption<TRequired extends boolean> implements Option<Date, TRequired> {
	constructor(
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): Option<Date, true> {
		return new DateOption<true>(this.description, true, this.localizations);
	}

	choices<const C extends readonly Date[]>(_values: C): Option<C[number], TRequired> {
		throw new OptionValidationError("Date options do not support choices.");
	}

	apply(container: OptionContainer, name: string): void {
		container.addStringOption((option) => {
			option.setName(name).setDescription(this.description).setRequired(this.isRequired);
			applyOptionLocalizations(option, this.localizations);
			return option;
		});
	}

	read(
		interaction: ChatInputCommandInteraction,
		name: string,
	): TRequired extends true ? Date : Date | null {
		const raw = interaction.options.getString(name, this.isRequired as boolean);
		if (raw === null) {
			return null as TRequired extends true ? Date : Date | null;
		}
		// Strict `YYYY-MM-DD` with a real-calendar check (rejects `2026/03/15`,
		// time-bearing input, and impossible dates like `2026-02-30`).
		if (!DATE_ONLY_PATTERN.test(raw) || !isValidWallClock(raw)) {
			throw new OptionValidationError(INVALID_DATE_ONLY_MESSAGE);
		}
		return new Date(raw) as TRequired extends true ? Date : Date | null;
	}
}

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
	return new DateOption<false>(description, false, localizations);
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

class ChannelOption<TType extends AllowedChannelType, TRequired extends boolean>
	implements Option<ChannelOptionValue<TType>, TRequired>
{
	constructor(
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly channelTypes: readonly TType[] | undefined,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): Option<ChannelOptionValue<TType>, true> {
		return new ChannelOption<TType, true>(
			this.description,
			true,
			this.channelTypes,
			this.localizations,
		);
	}

	choices<const C extends readonly ChannelOptionValue<TType>[]>(
		_values: C,
	): Option<C[number], TRequired> {
		throw new OptionValidationError("Channel options do not support choices.");
	}

	apply(container: OptionContainer, name: string): void {
		container.addChannelOption((option) => {
			option.setName(name).setDescription(this.description).setRequired(this.isRequired);
			applyOptionLocalizations(option, this.localizations);
			if (this.channelTypes !== undefined) {
				option.addChannelTypes(...this.channelTypes);
			}
			return option;
		});
	}

	read(
		interaction: ChatInputCommandInteraction,
		name: string,
	): TRequired extends true ? ChannelOptionValue<TType> : ChannelOptionValue<TType> | null {
		// The declared types are re-sent at read time: `addChannelTypes` only drives
		// the client-side picker, so Discord can still deliver another channel kind.
		return interaction.options.getChannel(
			name,
			this.isRequired as boolean,
			this.channelTypes,
		) as TRequired extends true ? ChannelOptionValue<TType> : ChannelOptionValue<TType> | null;
	}
}

export function createChannelOption<const TType extends AllowedChannelType = AllowedChannelType>(
	description: string,
	channelTypes?: readonly TType[],
	localizations: OptionLocalizations = {},
): Option<ChannelOptionValue<TType>, false> {
	return new ChannelOption<TType, false>(description, false, channelTypes, localizations);
}

class RoleOption<TRequired extends boolean> implements Option<Role, TRequired> {
	constructor(
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): Option<Role, true> {
		return new RoleOption<true>(this.description, true, this.localizations);
	}

	choices<const C extends readonly Role[]>(_values: C): Option<C[number], TRequired> {
		throw new OptionValidationError("Role options do not support choices.");
	}

	apply(container: OptionContainer, name: string): void {
		container.addRoleOption((option) => {
			option.setName(name).setDescription(this.description).setRequired(this.isRequired);
			applyOptionLocalizations(option, this.localizations);
			return option;
		});
	}

	read(
		interaction: ChatInputCommandInteraction,
		name: string,
	): TRequired extends true ? Role : Role | null {
		return interaction.options.getRole(name, this.isRequired as boolean) as TRequired extends true
			? Role
			: Role | null;
	}
}

export function createRoleOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<Role, false> {
	return new RoleOption<false>(description, false, localizations);
}

class MentionableOption<TRequired extends boolean> implements Option<Role | User, TRequired> {
	constructor(
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): Option<Role | User, true> {
		return new MentionableOption<true>(this.description, true, this.localizations);
	}

	choices<const C extends readonly (Role | User)[]>(_values: C): Option<C[number], TRequired> {
		throw new OptionValidationError("Mentionable options do not support choices.");
	}

	apply(container: OptionContainer, name: string): void {
		container.addMentionableOption((option) => {
			option.setName(name).setDescription(this.description).setRequired(this.isRequired);
			applyOptionLocalizations(option, this.localizations);
			return option;
		});
	}

	read(
		interaction: ChatInputCommandInteraction,
		name: string,
	): TRequired extends true ? Role | User : Role | User | null {
		return interaction.options.getMentionable(
			name,
			this.isRequired as boolean,
		) as TRequired extends true ? Role | User : Role | User | null;
	}
}

export function createMentionableOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<Role | User, false> {
	return new MentionableOption<false>(description, false, localizations);
}

class AttachmentOption<TRequired extends boolean> implements Option<Attachment, TRequired> {
	constructor(
		readonly description: string,
		readonly isRequired: TRequired,
		private readonly localizations: OptionLocalizations = {},
	) {}

	required(): Option<Attachment, true> {
		return new AttachmentOption<true>(this.description, true, this.localizations);
	}

	choices<const C extends readonly Attachment[]>(_values: C): Option<C[number], TRequired> {
		throw new OptionValidationError("Attachment options do not support choices.");
	}

	apply(container: OptionContainer, name: string): void {
		container.addAttachmentOption((option) => {
			option.setName(name).setDescription(this.description).setRequired(this.isRequired);
			applyOptionLocalizations(option, this.localizations);
			return option;
		});
	}

	read(
		interaction: ChatInputCommandInteraction,
		name: string,
	): TRequired extends true ? Attachment : Attachment | null {
		return interaction.options.getAttachment(
			name,
			this.isRequired as boolean,
		) as TRequired extends true ? Attachment : Attachment | null;
	}
}

export function createAttachmentOption(
	description: string,
	localizations: OptionLocalizations = {},
): Option<Attachment, false> {
	return new AttachmentOption<false>(description, false, localizations);
}

type AsRequired<O> = O extends Option<infer V, boolean> ? Option<V, true> : never;

/** Turn every option in a record into its required variant. */
export function allRequired<O extends Options>(fields: O): { [K in keyof O]: AsRequired<O[K]> } {
	const out = {} as { [K in keyof O]: AsRequired<O[K]> };
	for (const [key, option] of Object.entries(fields)) {
		out[key as keyof O] = option.required() as AsRequired<O[keyof O]>;
	}
	return out;
}
