/**
 * The five roles an embed colour can play. A bot restyles by supplying its own
 * values for these, never by adding a sixth: a role the kernel does not know is
 * a module's own constant, not a theme entry.
 */
export interface EmbedColors {
	success: number;
	warning: number;
	danger: number;
	/** The bot's own identity, for embeds that should not read as Discord's. */
	brand: number;
	/** Neutral informational embeds — listings, recaps, previews. */
	neutral: number;
}

/** Convert a `#rrggbb` string to the integer discord.js wants for `setColor`. */
export function toDiscordColor(hex: string): number {
	return Number.parseInt(hex.slice(1), 16);
}

/** Discord's own brand colour, the fallback for a bot that declares no palette. */
export const DISCORD_BLURPLE = "#5865f2";

/**
 * What every embed renders as until the composition root says otherwise. Kept
 * deliberately unbranded: a kernel that shipped one bot's colours would make
 * every other bot start out wearing them.
 */
export const DEFAULT_EMBED_COLORS: Readonly<EmbedColors> = {
	success: toDiscordColor("#22c55e"),
	warning: toDiscordColor("#e67e22"),
	danger: toDiscordColor("#ef4444"),
	brand: toDiscordColor(DISCORD_BLURPLE),
	neutral: toDiscordColor(DISCORD_BLURPLE),
};

/**
 * The live palette every embed reads, in the kernel and in the modules alike.
 *
 * This is the one piece of module-level state the kernel keeps, and it is a
 * deliberate exception to "DI, no singletons". A colour is read deep inside pure
 * view functions that build an embed from a value object — threading a theme
 * through every one of them would put a parameter nobody reasons about on the
 * whole rendering surface, to express something that is global by nature: a bot
 * has one palette, decided once, for its entire run.
 *
 * Read it, never copy it: destructuring at module load captures the defaults
 * before {@link configureEmbedColors} has run.
 */
export const EMBED_COLORS: EmbedColors = { ...DEFAULT_EMBED_COLORS };

/**
 * Replace some or all of the palette. Call it from the composition root, before
 * any module is constructed — after that, an embed may already have rendered.
 */
export function configureEmbedColors(overrides: Partial<EmbedColors>): void {
	Object.assign(EMBED_COLORS, overrides);
}
