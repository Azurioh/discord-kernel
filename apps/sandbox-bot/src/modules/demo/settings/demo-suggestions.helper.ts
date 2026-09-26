import type { Choice } from "@azurioh/discord-kernel/settings";
import {
	DEMO_CHANNEL_NAMES,
	DEMO_TIMEZONES,
} from "@/modules/demo/settings/demo-suggestions.constant";

/** A time zone as a member reads it: `Europe/Paris` reads `Europe · Paris`. */
function timezoneName(zone: string): string {
	return zone.replaceAll("_", " ").replace("/", " · ");
}

/** The entries of `values` whose value or name contains `query`, whatever its case. */
function matching(values: readonly string[], name: (value: string) => string, query: string) {
	const needle = query.trim().toLowerCase();
	return values
		.map((value): Choice => ({ name: name(value), value }))
		.filter(
			(choice) =>
				String(choice.value).toLowerCase().includes(needle) ||
				choice.name.toLowerCase().includes(needle),
		);
}

/**
 * The demo's time zone search: the zones of {@link DEMO_TIMEZONES} whose name
 * contains the query. The kernel keeps the first 25.
 */
export async function searchTimezones(query: string): Promise<readonly Choice[]> {
	return matching(DEMO_TIMEZONES, timezoneName, query);
}

/** The readable name of a known zone; `undefined` for any other, which a strict field refuses. */
export async function timezoneLabel(zone: string): Promise<string | undefined> {
	return (DEMO_TIMEZONES as readonly string[]).includes(zone) ? timezoneName(zone) : undefined;
}

/** The demo's suggested welcome channel names, `#name`, filtered by query. */
export async function searchChannelNames(query: string): Promise<readonly Choice[]> {
	return matching(DEMO_CHANNEL_NAMES, (name) => `#${name}`, query);
}
