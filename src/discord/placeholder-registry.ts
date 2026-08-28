import { DuplicatePlaceholderTokenError } from "@/discord/placeholder-registry-errors";
import type { Locale } from "@/i18n";

/**
 * A token a module offers to text another module's administrator writes,
 * resolved only once that text is actually rendered.
 *
 * `core` sits between the two by design: a module that publishes a token
 * (`tournament`'s `{tournament_template}`) and a module that renders text
 * carrying it (`ticket`'s welcome message) never import each other —
 * `AGENTS.md` forbids it. Both go through {@link PlaceholderRegistry} instead,
 * which `bootstrap` hands to every module factory from the same container-held
 * instance, so neither module ever names the other.
 */
export interface PlaceholderProvider {
	/** The token, braces included — `{tournament_template}`. */
	readonly token: string;
	/** What it becomes, for one guild, at render time. */
	resolve(guildId: string, locale: Locale): Promise<string>;
	/**
	 * Catalog key describing this token in the legend an admin reads while
	 * writing the text — owned by the module that offers the token, since it is
	 * the only one that knows what the token means.
	 */
	readonly legendKey: string;
}

/**
 * Accumulates every {@link PlaceholderProvider} registered at boot and resolves
 * them against a piece of already-rendered text.
 *
 * Consulted at render, never at construction — that is what makes the order
 * `bootstrap/modules.ts` lists modules in irrelevant here: a module registers
 * into this from its own factory, whatever position it holds in that list, and
 * `resolve` only ever reads the registry as it stands by the time some guild's
 * text is actually rendered — well after every module has finished
 * registering, unlike `ChannelExporter` (`bootstrap/channel-exporter.ts`),
 * which has to be built with the enabled module list already known.
 */
export class PlaceholderRegistry {
	private readonly providers: PlaceholderProvider[] = [];

	/** @throws DuplicatePlaceholderTokenError — a boot-time wiring mistake. */
	register(provider: PlaceholderProvider): void {
		if (this.providers.some((existing) => existing.token === provider.token)) {
			throw new DuplicatePlaceholderTokenError(provider.token);
		}
		this.providers.push(provider);
	}

	/** Every registered provider, in registration order — for building a legend. */
	list(): readonly PlaceholderProvider[] {
		return this.providers;
	}

	/** The token every registered provider answers to. */
	tokens(): readonly string[] {
		return this.providers.map((provider) => provider.token);
	}

	/**
	 * Replace every registered token `text` carries with what it resolves to for
	 * `guildId`/`locale`. A provider whose token is absent from `text` is never
	 * asked to resolve — the common case, since one guild's text rarely uses
	 * every token every module has ever registered.
	 */
	async resolve(text: string, guildId: string, locale: Locale): Promise<string> {
		let result = text;
		for (const provider of this.providers) {
			if (result.includes(provider.token)) {
				const value = await provider.resolve(guildId, locale);
				result = result.split(provider.token).join(value);
			}
		}
		return result;
	}
}
