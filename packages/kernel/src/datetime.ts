/**
 * Wall-clock datetime input grammar: `YYYY-MM-DD` with an optional
 * ` HH:MM` / `THH:MM` time (seconds optional). Matches the format documented to
 * users in the slash-command options.
 */
const WALL_CLOCK_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

interface WallClock {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
}

function parseWallClock(input: string): WallClock | null {
	const match = WALL_CLOCK_PATTERN.exec(input.trim());
	if (!match) {
		return null;
	}
	const [, year, month, day, hour, minute, second] = match;
	const wallClock: WallClock = {
		year: Number(year),
		month: Number(month),
		day: Number(day),
		hour: hour ? Number(hour) : 0,
		minute: minute ? Number(minute) : 0,
		second: second ? Number(second) : 0,
	};
	return isRealCalendarInstant(wallClock) ? wallClock : null;
}

/**
 * Reject impossible values the regex alone allows (month 13, day 32, hour 25)
 * by round-tripping through `Date.UTC` and checking nothing overflowed.
 */
function isRealCalendarInstant(wallClock: WallClock): boolean {
	const date = new Date(
		Date.UTC(
			wallClock.year,
			wallClock.month - 1,
			wallClock.day,
			wallClock.hour,
			wallClock.minute,
			wallClock.second,
		),
	);
	return (
		date.getUTCFullYear() === wallClock.year &&
		date.getUTCMonth() === wallClock.month - 1 &&
		date.getUTCDate() === wallClock.day &&
		date.getUTCHours() === wallClock.hour &&
		date.getUTCMinutes() === wallClock.minute &&
		date.getUTCSeconds() === wallClock.second
	);
}

/**
 * Offset, in milliseconds, between the given instant and how that instant reads
 * as a wall clock in `timeZone` (positive when the zone is ahead of UTC).
 */
function timeZoneOffsetMs(timestamp: number, timeZone: string): number {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const parts = new Map<string, number>();
	for (const { type, value } of formatter.formatToParts(new Date(timestamp))) {
		if (type !== "literal") {
			parts.set(type, Number(value));
		}
	}
	const read = (key: string): number => {
		const value = parts.get(key);
		if (value === undefined) {
			throw new RangeError(`Missing "${key}" in formatted parts for time zone "${timeZone}"`);
		}
		return value;
	};
	const asUtc = Date.UTC(
		read("year"),
		read("month") - 1,
		read("day"),
		read("hour"),
		read("minute"),
		read("second"),
	);
	return asUtc - timestamp;
}

/**
 * Interpret a wall-clock datetime string as local time in `timeZone` and return
 * the matching UTC instant. Discord renders stored timestamps in each viewer's
 * own timezone, so an event entered as "18:00" guild-local must be stored as the
 * equivalent UTC instant — otherwise it drifts by the guild's UTC offset.
 * @throws RangeError When the input does not match the wall-clock grammar.
 */
export function zonedWallClockToUtc(input: string, timeZone: string): Date {
	const wallClock = parseWallClock(input);
	if (!wallClock) {
		throw new RangeError(`Invalid wall-clock datetime: "${input}"`);
	}
	const utcGuess = Date.UTC(
		wallClock.year,
		wallClock.month - 1,
		wallClock.day,
		wallClock.hour,
		wallClock.minute,
		wallClock.second,
	);
	// Two passes: the offset read at `utcGuess` can be wrong across a DST
	// transition (the guessed instant may land on the far side of the boundary
	// from the target). Re-reading the offset at the first candidate pins the
	// correct one for every time except the ~1h/year that either does not exist
	// (spring-forward gap) or is ambiguous (fall-back overlap), which resolve
	// deterministically to one side.
	const firstOffset = timeZoneOffsetMs(utcGuess, timeZone);
	const secondOffset = timeZoneOffsetMs(utcGuess - firstOffset, timeZone);
	return new Date(utcGuess - secondOffset);
}

/** Whether `input` is a valid wall-clock datetime string. */
export function isValidWallClock(input: string): boolean {
	return parseWallClock(input) !== null;
}

/** `YYYY-MM-DD` of a date-only value, read in UTC (matches `Date`-only options). */
export function dayString(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** Start of `date`'s calendar day (00:00:00) anchored to `timeZone`. */
export function startOfGuildDay(date: Date, timeZone: string): Date {
	return zonedWallClockToUtc(`${dayString(date)} 00:00:00`, timeZone);
}

/** End of `date`'s calendar day (23:59:59) anchored to `timeZone`. */
export function endOfGuildDay(date: Date, timeZone: string): Date {
	return zonedWallClockToUtc(`${dayString(date)} 23:59:59`, timeZone);
}

/**
 * Monday 00:00 (guild-local) of the week following `reference`'s week. Used to
 * anchor "next week"/"week after next" ranges to the guild's own calendar
 * rather than to UTC day boundaries, which can disagree with the guild's local
 * week near midnight around the timezone offset.
 */
export function startOfNextGuildWeek(reference: Date, timeZone: string): Date {
	// Both the weekday *and* the calendar date must be read in `timeZone`, not
	// UTC: near midnight, the guild-local day can already differ from the UTC
	// day, and mixing the two would misplace the coming Monday by a day.
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "short",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const weekdayIndex: Record<string, number> = {
		Sun: 0,
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6,
	};
	const parts = new Map<string, string>();
	for (const { type, value } of formatter.formatToParts(reference)) {
		if (type !== "literal") {
			parts.set(type, value);
		}
	}
	const currentDay = weekdayIndex[parts.get("weekday") ?? ""] ?? 0;
	// ISO week starts on Monday: ahead-days is 0 only when already Monday and we
	// still want *next* week's Monday, hence the `=== 1 ? 7` special-case.
	const daysUntilNextMonday = currentDay === 1 ? 7 : (8 - currentDay) % 7;
	// Advance the *calendar date* (a pure Y-M-D operation, DST-agnostic) before
	// re-anchoring to the timezone — advancing the UTC instant instead would
	// drift by an hour across a DST transition inside the date range.
	const year = Number(parts.get("year"));
	const month = Number(parts.get("month"));
	const day = Number(parts.get("day"));
	const nextMondayUtcCalendarDay = new Date(Date.UTC(year, month - 1, day + daysUntilNextMonday));
	return startOfGuildDay(nextMondayUtcCalendarDay, timeZone);
}
/**
 * Add `days` guild-local calendar days to `instant`, re-anchoring to
 * `timeZone`'s midnight. `instant` is assumed to already be a guild-local
 * midnight (e.g. the result of {@link startOfGuildDay} or
 * {@link startOfNextGuildWeek}); adding a fixed millisecond offset instead
 * would drift by the DST delta whenever the interval crosses a transition —
 * this reads the calendar date in `timeZone` first, so the result is always
 * that timezone's actual midnight `days` later.
 */
export function addGuildDays(instant: Date, days: number, timeZone: string): Date {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const parts = new Map<string, string>();
	for (const { type, value } of formatter.formatToParts(instant)) {
		if (type !== "literal") {
			parts.set(type, value);
		}
	}
	const year = Number(parts.get("year"));
	const month = Number(parts.get("month"));
	const day = Number(parts.get("day"));
	const shiftedUtcCalendarDay = new Date(Date.UTC(year, month - 1, day + days));
	return startOfGuildDay(shiftedUtcCalendarDay, timeZone);
}
