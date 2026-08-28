import type { ChatInputCommandInteraction } from "discord.js";
import { ChannelType } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { OptionValidationError } from "@/discord/command/errors";
import {
	createAttachmentOption,
	createBooleanOption,
	createChannelOption,
	createIntegerOption,
	createMentionableOption,
	createNumberOption,
	createRoleOption,
	createStringOption,
	createUserOption,
	type Option,
	type OptionContainer,
} from "@/discord/command/options";

const OPTION_NAME = "target";

/**
 * Records every setter an option calls, so a test can assert on what would be
 * sent to Discord without building a real (validating) discord.js builder.
 */
interface BuilderSpy {
	readonly calls: Record<string, unknown[]>;
}

/**
 * The builder setters an option may call. Listing them explicitly (rather than
 * trapping every property) keeps the fake honest: a typo in production code
 * surfaces as a missing call instead of being silently absorbed.
 */
const BUILDER_METHODS = [
	"setName",
	"setDescription",
	"setRequired",
	"setNameLocalizations",
	"setDescriptionLocalizations",
	"setMinValue",
	"setMaxValue",
	"setMinLength",
	"setMaxLength",
	"setAutocomplete",
	"addChoices",
	"addChannelTypes",
] as const;

function createBuilderSpy(): BuilderSpy {
	const calls: Record<string, unknown[]> = {};
	const spy: Record<string, unknown> = { calls };
	for (const method of BUILDER_METHODS) {
		spy[method] = (...args: unknown[]) => {
			calls[method] = args;
			return spy;
		};
	}
	return spy as unknown as BuilderSpy;
}

/** Applies an option through the container method it is expected to use. */
function applyOption(option: Option<unknown, boolean>, adder: keyof OptionContainer): BuilderSpy {
	const spy = createBuilderSpy();
	const container = {
		[adder]: (input: (builder: unknown) => unknown) => input(spy),
	} as unknown as OptionContainer;
	option.apply(container, OPTION_NAME);
	return spy;
}

/** A fake resolver returning `value` from whichever getter the option calls. */
function createInteractionStub(getter: string, value: unknown): ChatInputCommandInteraction {
	return {
		options: { [getter]: vi.fn().mockReturnValue(value) },
	} as unknown as ChatInputCommandInteraction;
}

describe("createChannelOption", () => {
	it("declares the allowed channel types on the builder", () => {
		const option = createChannelOption("A voice channel", [ChannelType.GuildVoice] as const);
		const spy = applyOption(option, "addChannelOption");
		expect(spy.calls.addChannelTypes).toEqual([ChannelType.GuildVoice]);
	});

	it("omits addChannelTypes when every channel is allowed", () => {
		const spy = applyOption(createChannelOption("Any channel"), "addChannelOption");
		expect(spy.calls.addChannelTypes).toBeUndefined();
	});

	// `addChannelTypes` only filters the client-side picker, so the same list has
	// to be re-sent at read time for the resolver to actually validate the input.
	it("forwards the channel types to getChannel so the read is validated", () => {
		const channelTypes = [ChannelType.GuildVoice, ChannelType.GuildStageVoice] as const;
		const option = createChannelOption("A voice channel", channelTypes);
		const channel = { id: "42" };
		const interaction = createInteractionStub("getChannel", channel);

		expect(option.read(interaction, OPTION_NAME)).toBe(channel);
		expect(interaction.options.getChannel).toHaveBeenCalledWith(OPTION_NAME, false, channelTypes);
	});

	it("declares itself required on the builder, keeping types and localizations", () => {
		const option = createChannelOption("A text channel", [ChannelType.GuildText] as const, {
			descriptionLocalizations: { fr: "Un salon textuel" },
		}).required();
		const spy = applyOption(option, "addChannelOption");

		expect(spy.calls.setRequired).toEqual([true]);
		expect(spy.calls.addChannelTypes).toEqual([ChannelType.GuildText]);
		expect(spy.calls.setDescriptionLocalizations).toEqual([{ fr: "Un salon textuel" }]);
	});

	it("keeps the channel types when made required", () => {
		const option = createChannelOption("A voice channel", [ChannelType.GuildVoice] as const);
		const interaction = createInteractionStub("getChannel", null);

		option.required().read(interaction, OPTION_NAME);

		expect(interaction.options.getChannel).toHaveBeenCalledWith(OPTION_NAME, true, [
			ChannelType.GuildVoice,
		]);
	});
});

describe("reading the new option types", () => {
	const cases = [
		{ label: "role", option: createRoleOption("A role"), getter: "getRole" },
		{
			label: "mentionable",
			option: createMentionableOption("A role or user"),
			getter: "getMentionable",
		},
		{ label: "number", option: createNumberOption("A number"), getter: "getNumber" },
		{ label: "attachment", option: createAttachmentOption("A file"), getter: "getAttachment" },
	] as const;

	for (const { label, option, getter } of cases) {
		it(`reads a ${label} through ${getter}`, () => {
			const value = { id: "resolved" };
			const interaction = createInteractionStub(getter, value);

			expect(option.read(interaction, OPTION_NAME)).toBe(value);
			expect(interaction.options[getter]).toHaveBeenCalledWith(OPTION_NAME, false);
		});

		it(`reads a ${label} as required once required() is called`, () => {
			const interaction = createInteractionStub(getter, null);

			option.required().read(interaction, OPTION_NAME);

			expect(interaction.options[getter]).toHaveBeenCalledWith(OPTION_NAME, true);
		});
	}
});

describe("string length bounds", () => {
	it("applies both bounds to the builder", () => {
		const option = createStringOption("A name", { minLength: 2, maxLength: 32 });
		const spy = applyOption(option, "addStringOption");

		expect(spy.calls.setMinLength).toEqual([2]);
		expect(spy.calls.setMaxLength).toEqual([32]);
	});

	it("applies only the bound that was provided", () => {
		const spy = applyOption(createStringOption("A name", { maxLength: 10 }), "addStringOption");

		expect(spy.calls.setMinLength).toBeUndefined();
		expect(spy.calls.setMaxLength).toEqual([10]);
	});

	it("preserves the bounds through required()", () => {
		const option = createStringOption("A name", { minLength: 3 }).required();
		const spy = applyOption(option, "addStringOption");

		expect(spy.calls.setMinLength).toEqual([3]);
		expect(spy.calls.setRequired).toEqual([true]);
	});
});

describe("number bounds", () => {
	it("applies min and max to the builder", () => {
		const spy = applyOption(
			createNumberOption("A ratio", { min: 0.5, max: 9.5 }),
			"addNumberOption",
		);

		expect(spy.calls.setMinValue).toEqual([0.5]);
		expect(spy.calls.setMaxValue).toEqual([9.5]);
	});
});

describe("choices()", () => {
	// Typed through the erased `Option` so the loop keeps one callable `choices`
	// signature instead of a union of mutually incompatible ones.
	const unsupported: readonly { label: string; option: Option<unknown, boolean> }[] = [
		{ label: "user", option: createUserOption("A user") },
		{ label: "boolean", option: createBooleanOption("A flag") },
		{ label: "integer", option: createIntegerOption("A count") },
		{ label: "number", option: createNumberOption("A ratio") },
		{ label: "role", option: createRoleOption("A role") },
		{ label: "mentionable", option: createMentionableOption("A mention") },
		{ label: "attachment", option: createAttachmentOption("A file") },
		{ label: "channel", option: createChannelOption("A channel") },
	];

	for (const { label, option } of unsupported) {
		it(`throws for a ${label} option`, () => {
			expect(() => option.choices([])).toThrow(OptionValidationError);
		});
	}

	it("still registers the choices of a string option", () => {
		const option = createStringOption("A mode").choices(["fast", "slow"]);
		const spy = applyOption(option, "addStringOption");

		expect(spy.calls.addChoices).toEqual([
			{ name: "fast", value: "fast" },
			{ name: "slow", value: "slow" },
		]);
	});
});

describe("withAutocomplete()", () => {
	const resolver = () => [{ name: "first", value: "1" }];

	it("exposes the resolver and flags the builder", () => {
		const option = createStringOption("A query").withAutocomplete(resolver);
		const spy = applyOption(option, "addStringOption");

		expect(option.autocomplete).toBe(resolver);
		expect(spy.calls.setAutocomplete).toEqual([true]);
	});

	it("flags integer and number builders too", () => {
		const integer = createIntegerOption("A count").withAutocomplete(resolver);
		const number = createNumberOption("A ratio").withAutocomplete(resolver);

		expect(applyOption(integer, "addIntegerOption").calls.setAutocomplete).toEqual([true]);
		expect(applyOption(number, "addNumberOption").calls.setAutocomplete).toEqual([true]);
	});

	it("survives required()", () => {
		const option = createStringOption("A query").withAutocomplete(resolver).required();
		const spy = applyOption(option, "addStringOption");

		expect(option.autocomplete).toBe(resolver);
		expect(spy.calls.setAutocomplete).toEqual([true]);
	});

	it("leaves the flag unset on a plain option", () => {
		const spy = applyOption(createStringOption("A query"), "addStringOption");
		expect(spy.calls.setAutocomplete).toBeUndefined();
	});

	// Discord rejects a command whose option carries both, so the DSL fails first.
	// `choices()` returns a plain `Option`, so the reverse chain is a type error:
	// this ordering is the only way the illegal pair can be built.
	it("throws at apply time when combined with choices", () => {
		const option = createStringOption("A mode")
			.withAutocomplete(resolver)
			.choices(["fast", "slow"]);

		expect(() => applyOption(option, "addStringOption")).toThrow(OptionValidationError);
	});
});
