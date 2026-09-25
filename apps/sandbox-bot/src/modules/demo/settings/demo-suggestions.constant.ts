/**
 * The IANA time zones the demo's `timezone` setting offers: a fixed list, so
 * the search behaves the same on every machine. 30 of them, more than one
 * Discord select shows, to exercise the 25-result cap.
 */
export const DEMO_TIMEZONES = [
	"UTC",
	"Europe/London",
	"Europe/Paris",
	"Europe/Berlin",
	"Europe/Madrid",
	"Europe/Rome",
	"Europe/Amsterdam",
	"Europe/Brussels",
	"Europe/Zurich",
	"Europe/Stockholm",
	"Europe/Warsaw",
	"Europe/Athens",
	"Europe/Istanbul",
	"Europe/Moscow",
	"Africa/Cairo",
	"Africa/Johannesburg",
	"Africa/Lagos",
	"Asia/Dubai",
	"Asia/Kolkata",
	"Asia/Bangkok",
	"Asia/Singapore",
	"Asia/Shanghai",
	"Asia/Tokyo",
	"Asia/Seoul",
	"Australia/Sydney",
	"Pacific/Auckland",
	"America/Sao_Paulo",
	"America/New_York",
	"America/Chicago",
	"America/Los_Angeles",
] as const;

/** The demo's suggested welcome channel names; any other name is accepted too. */
export const DEMO_CHANNEL_NAMES = ["welcome", "general", "introductions", "lobby"] as const;
