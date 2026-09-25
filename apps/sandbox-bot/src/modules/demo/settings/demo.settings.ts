import { defineSettings, field, type SettingsMigration } from "@azurioh/discord-kernel/settings";
import { DEMO_SETTINGS_MESSAGES } from "@/modules/demo/i18n/demo.messages";

/**
 * Bring values stored under an older version to the current shape. Version 2
 * renamed `maxWarnings` to `warnLimit`. Pure (the kernel validates and stores
 * the result), and it handles every older version: a version it does not know
 * throws, which the kernel logs, leaving the stored record as it was.
 */
const migrateDemoSettings: SettingsMigration = (fromVersion, raw) => {
	if (fromVersion !== 1) {
		throw new Error(`demo settings: no migration from version ${fromVersion}`);
	}
	const { maxWarnings, ...rest } = raw as Record<string, unknown>;
	return maxWarnings === undefined ? rest : { ...rest, warnLimit: maxWarnings };
};

/**
 * One field of most kinds, to try each validation rule from `/config set`.
 * Version 2 shows a migration: see {@link migrateDemoSettings}.
 */
export const demoSettings = defineSettings({
	id: "demo",
	version: 2,
	migrate: migrateDemoSettings,
	labels: { title: DEMO_SETTINGS_MESSAGES.title, description: DEMO_SETTINGS_MESSAGES.description },
	fields: {
		logChannel: field.channel({
			label: DEMO_SETTINGS_MESSAGES.logChannel,
			description: DEMO_SETTINGS_MESSAGES.logChannelDescription,
			types: ["text", "announcement"],
			required: true,
		}),
		staffRole: field.role({ label: DEMO_SETTINGS_MESSAGES.staffRole }),
		accent: field.color({ label: DEMO_SETTINGS_MESSAGES.accent, default: "#5865f2" }),
		cooldown: field.duration({
			label: DEMO_SETTINGS_MESSAGES.cooldown,
			min: 5,
			max: 3600,
			default: 30,
		}),
		mode: field.enum({
			label: DEMO_SETTINGS_MESSAGES.mode,
			choices: [
				{ value: "relaxed", label: DEMO_SETTINGS_MESSAGES.modeRelaxed },
				{ value: "strict", label: DEMO_SETTINGS_MESSAGES.modeStrict },
			],
			default: "relaxed",
		}),
		warnLimit: field.integer({
			label: DEMO_SETTINGS_MESSAGES.warnLimit,
			min: 1,
			max: 10,
			default: 3,
		}),
		features: field.toggles({
			label: DEMO_SETTINGS_MESSAGES.features,
			keys: ["welcome", "logs"],
			keyLabels: {
				welcome: DEMO_SETTINGS_MESSAGES.featuresWelcome,
				logs: DEMO_SETTINGS_MESSAGES.featuresLogs,
			},
			default: { welcome: true },
		}),
		apiKey: field.secret({ label: DEMO_SETTINGS_MESSAGES.apiKey }),
		pingRoles: field.list(field.role(), {
			label: DEMO_SETTINGS_MESSAGES.pingRoles,
			maxItems: 5,
			default: [],
		}),
	},
});
