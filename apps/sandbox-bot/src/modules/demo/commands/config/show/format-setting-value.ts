import type { FieldSpec, SecretState } from "@azurioh/discord-kernel/settings";
import { DEMO_MESSAGES } from "@/modules/demo/i18n/demo-messages";
import type { Translate } from "@/shared/i18n/translate";

/**
 * Render one surface value of a field for an embed, mentions included.
 *
 * @param params.spec - the field's kind and constraints.
 * @param params.value - the value `getForSurface` returned for it.
 * @param params.t - translates a catalog key in the reader's language.
 * @returns the text to show.
 */
export function formatSettingValue(params: {
	spec: FieldSpec;
	value: unknown;
	t: Translate;
}): string {
	const { spec, value, t } = params;
	if (value === undefined) {
		return t(DEMO_MESSAGES.notSet);
	}
	switch (spec.kind) {
		case "channel":
			return `<#${String(value)}>`;
		case "role":
			return `<@&${String(value)}>`;
		case "user":
			return `<@${String(value)}>`;
		case "color":
		case "enum":
		case "text":
			return `\`${String(value)}\``;
		case "duration":
			return `${String(value)} s`;
		case "integer":
		case "number":
			return String(value);
		case "boolean":
			return t(value === true ? DEMO_MESSAGES.on : DEMO_MESSAGES.off);
		case "secret":
			return t((value as SecretState).isSet ? DEMO_MESSAGES.secretSet : DEMO_MESSAGES.secretNotSet);
		case "list": {
			const items = value as readonly unknown[];
			if (items.length === 0) {
				return t(DEMO_MESSAGES.notSet);
			}
			return items
				.map((item) => formatSettingValue({ spec: spec.item.spec, value: item, t }))
				.join(", ");
		}
		case "toggles":
			return Object.entries(value as Readonly<Record<string, boolean>>)
				.map(([key, enabled]) => `${key}: ${t(enabled ? DEMO_MESSAGES.on : DEMO_MESSAGES.off)}`)
				.join(", ");
		default: {
			// A kind added to the kernel fails to compile here until it is rendered.
			const unhandled: never = spec;
			return String(unhandled);
		}
	}
}
