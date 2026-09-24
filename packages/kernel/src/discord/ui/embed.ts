import { EmbedBuilder } from "discord.js";

/** Discord hard limit on the number of fields per embed. */
const MAX_EMBED_FIELDS = 25;
/** Discord hard limit on a field name length. */
const MAX_FIELD_NAME = 256;
/** Discord hard limit on a field value length. */
const MAX_FIELD_VALUE = 1024;
/** Discord hard limit on the total character count of an embed. */
const MAX_EMBED_TOTAL = 6000;
/** Headroom kept free for footer/title so the total stays under the limit. */
const EMBED_TOTAL_SAFETY_MARGIN = 256;

/** A single embed field. */
export interface EmbedField {
	name: string;
	value: string;
}

/**
 * Add fields to an embed while respecting Discord's size limits. Truncates
 * over-long names/values, stops before exceeding the 25-field or 6000-character
 * caps, and appends an overflow footer when some fields were dropped — so the
 * embed can always be sent (no `MAX_EMBED_SIZE_EXCEEDED` rejection).
 */
export function appendBoundedFields(
	embed: EmbedBuilder,
	fields: EmbedField[],
	overflowFooter: (hiddenCount: number) => string,
): void {
	let usedChars = (embed.data.title?.length ?? 0) + (embed.data.description?.length ?? 0);
	let shown = 0;

	for (const field of fields) {
		if (shown >= MAX_EMBED_FIELDS) {
			break;
		}
		const name = truncate(field.name, MAX_FIELD_NAME);
		const value = truncate(field.value, MAX_FIELD_VALUE);
		if (usedChars + name.length + value.length > MAX_EMBED_TOTAL - EMBED_TOTAL_SAFETY_MARGIN) {
			break;
		}
		embed.addFields({ name, value });
		usedChars += name.length + value.length;
		shown += 1;
	}

	const hidden = fields.length - shown;
	if (hidden > 0) {
		embed.setFooter({ text: overflowFooter(hidden) });
	}
}

function truncate(text: string, max: number): string {
	if (text.length <= max) {
		return text;
	}
	return `${text.slice(0, max - 1)}…`;
}

/** Build a plain titled embed. */
export function buildEmbed(title: string, description: string): EmbedBuilder {
	return new EmbedBuilder().setTitle(title).setDescription(description);
}
