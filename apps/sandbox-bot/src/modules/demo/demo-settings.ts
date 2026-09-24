import { defineSettings, field } from "@azurioh/discord-kernel/settings";

/** One field of most kinds, to try each validation rule from `/config set`. */
export const demoSettings = defineSettings({
	id: "demo",
	version: 1,
	labels: { title: "demo.settings.title", description: "demo.settings.description" },
	fields: {
		logChannel: field.channel({
			label: "demo.settings.log-channel",
			description: "demo.settings.log-channel.description",
			types: ["text", "announcement"],
			required: true,
		}),
		staffRole: field.role({ label: "demo.settings.staff-role" }),
		accent: field.color({ label: "demo.settings.accent", default: "#5865f2" }),
		cooldown: field.duration({
			label: "demo.settings.cooldown",
			min: 5,
			max: 3600,
			default: 30,
		}),
		mode: field.enum({
			label: "demo.settings.mode",
			choices: [
				{ value: "relaxed", label: "demo.settings.mode.relaxed" },
				{ value: "strict", label: "demo.settings.mode.strict" },
			],
			default: "relaxed",
		}),
		maxWarnings: field.integer({
			label: "demo.settings.max-warnings",
			min: 1,
			max: 10,
			default: 3,
		}),
		features: field.toggles({
			label: "demo.settings.features",
			keys: ["welcome", "logs"],
			keyLabels: {
				welcome: "demo.settings.features.welcome",
				logs: "demo.settings.features.logs",
			},
			default: { welcome: true },
		}),
		apiKey: field.secret({ label: "demo.settings.api-key" }),
		pingRoles: field.list(field.role(), {
			label: "demo.settings.ping-roles",
			maxItems: 5,
			default: [],
		}),
	},
});
