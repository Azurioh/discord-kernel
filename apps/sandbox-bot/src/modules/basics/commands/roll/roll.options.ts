import { createIntegerOption } from "@azurioh/discord-kernel/discord/command/options";
import { BASICS_CATALOG } from "@/modules/basics/i18n/basics.catalog";
import { BASICS_MESSAGES } from "@/modules/basics/i18n/basics.messages";
import { localizedDescription } from "@/shared/discord/localized-description";

/** The number of sides when `/roll` is given none. */
export const DEFAULT_SIDES = 6;

/** The options of `/roll`: an optional number of sides, 2 to 100. */
export function createRollOptions() {
	const sides = localizedDescription(BASICS_CATALOG, BASICS_MESSAGES.rollSidesDescription);
	return {
		sides: createIntegerOption(sides.description, { min: 2, max: 100 }, sides),
	};
}

export type RollOptions = ReturnType<typeof createRollOptions>;
