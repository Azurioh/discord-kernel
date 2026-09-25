import { vi } from "vitest";
import type { LocaleResolver } from "@/discord/interaction/locale-resolver";
import type { Locale } from "@/i18n/locale";

/**
 * A {@link LocaleResolver} double that answers `locale` for every interaction.
 * `resolve` is a spy, so a suite can check what it was asked.
 */
export function createFakeLocaleResolver(locale: Locale): LocaleResolver {
	return { resolve: vi.fn(async () => locale) };
}
