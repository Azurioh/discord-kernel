import { vi } from "vitest";
import { createFixedLocaleResolver } from "@/discord/interaction/fixed-locale-resolver";
import type { LocaleResolver } from "@/discord/interaction/locale-resolver";
import type { Locale } from "@/i18n/locale";

/**
 * A {@link LocaleResolver} double over the fixed twin: answers `locale` for
 * every interaction, and `resolve` is a spy, so a suite can check what it was asked.
 */
export function createFakeLocaleResolver(locale: Locale): LocaleResolver {
	const resolver = createFixedLocaleResolver(locale);
	vi.spyOn(resolver, "resolve");
	return resolver;
}
