import { defineSettings } from "@/settings/define-settings";
import { field } from "@/settings/fields/builders";

/** Opaque access values: stored on the declaration, never enforced by the settings feature. */
export const SAMPLE_MODULE_ACCESS = { permission: "sample.settings.manage" };
export const SAMPLE_GROUP_ACCESS = { permission: "sample.settings.limits" };
export const SAMPLE_FIELD_ACCESS = { permission: "sample.settings.secret" };

const TIER_CHOICES = [
	{ value: "gold", label: "sample.settings.tier.gold" },
	{ value: "silver", label: "sample.settings.tier.silver" },
] as const;

/**
 * One field of every kind (and a list of every allowed item kind), with
 * defaults, two groups, module and field hints and an access value at every
 * level. Shared by the settings tests.
 */
export const sampleSettings = defineSettings({
	id: "sample",
	version: 1,
	labels: { title: "sample.settings.title", description: "sample.settings.description" },
	ui: { icon: "gear", groupOrder: ["general", "limits"] },
	access: SAMPLE_MODULE_ACCESS,
	groups: {
		general: {
			label: "sample.settings.group.general",
			description: "sample.settings.group.general.description",
			order: 1,
		},
		limits: {
			label: "sample.settings.group.limits",
			order: 2,
			access: SAMPLE_GROUP_ACCESS,
		},
	},
	fields: {
		logChannel: field.channel({
			label: "sample.settings.log-channel",
			types: ["text", "announcement"],
			required: true,
			ui: { group: "general", order: 1 },
		}),
		staffRole: field.role({
			label: "sample.settings.staff-role",
			ui: { group: "general", order: 2 },
		}),
		owner: field.user({ label: "sample.settings.owner" }),
		accent: field.color({ label: "sample.settings.accent", default: "#5865f2" }),
		cooldown: field.duration({
			label: "sample.settings.cooldown",
			min: 60,
			max: 86_400,
			default: 900,
			unit: "sample.settings.unit.seconds",
		}),
		region: field.enum({
			label: "sample.settings.region",
			choices: [
				{ value: "eu", label: "sample.settings.region.eu" },
				{ value: "na", label: "sample.settings.region.na" },
			],
			default: "eu",
		}),
		maxOpen: field.integer({
			label: "sample.settings.max-open",
			description: "sample.settings.max-open.description",
			min: 1,
			max: 5,
			default: 1,
			unit: "sample.settings.unit.tickets",
			ui: { group: "limits", order: 1, hint: "slider", advanced: true, examples: [1, 3] },
		}),
		ratio: field.number({ label: "sample.settings.ratio", min: 0, max: 1 }),
		greeting: field.text({
			label: "sample.settings.greeting",
			placeholder: "sample.settings.greeting.placeholder",
			maxLength: 200,
			ui: { examples: ["Welcome!"] },
		}),
		enabled: field.boolean({ label: "sample.settings.enabled", default: true }),
		apiKey: field.secret({
			label: "sample.settings.api-key",
			description: "sample.settings.api-key.description",
			ui: { group: "limits", advanced: true },
			access: SAMPLE_FIELD_ACCESS,
		}),
		watchedChannels: field.list(field.channel({ types: ["text"] }), {
			label: "sample.settings.watched-channels",
			maxItems: 5,
			default: [],
		}),
		pingRoles: field.list(field.role(), { label: "sample.settings.ping-roles" }),
		notifyUsers: field.list(field.user(), { label: "sample.settings.notify-users" }),
		tiers: field.list(field.enum({ choices: TIER_CHOICES }), { label: "sample.settings.tiers" }),
		thresholds: field.list(field.integer({ min: 1 }), {
			label: "sample.settings.thresholds",
			maxItems: 10,
		}),
		keywords: field.list(field.text({ maxLength: 50 }), {
			label: "sample.settings.keywords",
			required: true,
		}),
		features: field.toggles({
			label: "sample.settings.features",
			keys: ["tickets", "logs"],
			default: { tickets: true },
			keyLabels: {
				tickets: "sample.settings.feature.tickets",
				logs: "sample.settings.feature.logs",
			},
		}),
	},
});

/** Every catalog key the sample declaration references. */
export const SAMPLE_KEYS = [
	"sample.settings.title",
	"sample.settings.description",
	"sample.settings.group.general",
	"sample.settings.group.general.description",
	"sample.settings.group.limits",
	"sample.settings.log-channel",
	"sample.settings.staff-role",
	"sample.settings.owner",
	"sample.settings.accent",
	"sample.settings.cooldown",
	"sample.settings.unit.seconds",
	"sample.settings.region",
	"sample.settings.region.eu",
	"sample.settings.region.na",
	"sample.settings.max-open",
	"sample.settings.max-open.description",
	"sample.settings.unit.tickets",
	"sample.settings.ratio",
	"sample.settings.greeting",
	"sample.settings.greeting.placeholder",
	"sample.settings.enabled",
	"sample.settings.api-key",
	"sample.settings.api-key.description",
	"sample.settings.watched-channels",
	"sample.settings.ping-roles",
	"sample.settings.notify-users",
	"sample.settings.tiers",
	"sample.settings.tier.gold",
	"sample.settings.tier.silver",
	"sample.settings.thresholds",
	"sample.settings.keywords",
	"sample.settings.features",
	"sample.settings.feature.tickets",
	"sample.settings.feature.logs",
] as const;
