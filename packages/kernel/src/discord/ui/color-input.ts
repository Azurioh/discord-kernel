import { parseHexColor } from "@/color";
import { resolveNamedColor } from "@/discord/ui/color-aliases";

/**
 * Normalize a colour input to `#RRGGBB`, from a hexadecimal code or from one of
 * the names in {@link import("@/discord/ui/color-aliases").COLOR_ALIASES} — an
 * administrator picking a colour should not have to look a hex code up. `null`
 * for anything that is neither: the refusal an administrator reads belongs to
 * whichever screen asked, so core reports that it could not read the value and
 * leaves the wording to the caller.
 */
export function parseColorInput(raw: string): string | null {
	return resolveNamedColor(raw) ?? parseHexColor(raw);
}
