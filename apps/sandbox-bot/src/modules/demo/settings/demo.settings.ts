import { defineSettings, field } from "@azurioh/discord-kernel/settings";
import { DEMO_SETTINGS_MESSAGES } from "@/modules/demo/i18n/demo.messages";

/** One field of most kinds, to try each validation rule from `/config set`. */
export const demoSettings = defineSettings({
	id: "demo",
	version: 1,
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
		maxWarnings: field.integer({
			label: DEMO_SETTINGS_MESSAGES.maxWarnings,
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
