import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: string | Date, locale: string = "ro") {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

export function formatTime(time: string) {
  return time.slice(0, 5);
}

const ICS_DURATION_MINUTES = 90;

/**
 * The timezone event times are entered in.
 *
 * The `events` table stores a plain `date` and `time` with no timezone — the
 * instructor types "18:00" meaning six in the evening in Romania. That is a
 * wall-clock time, not an instant, and it only becomes an instant once you say
 * which zone it belongs to.
 */
export const EVENT_TIME_ZONE = "Europe/Bucharest";

/**
 * Converts a wall-clock date/time in a named timezone into a real instant.
 *
 * THE BUG THIS FIXES
 *
 * The old code did `new Date("2026-08-07T18:00")`. A string like that has no
 * timezone marker, so JavaScript interprets it in whatever timezone the machine
 * happens to be in. On a laptop in Romania that is correct by luck. On Vercel,
 * where servers run in UTC, "18:00" was read as 18:00 UTC and then written into
 * the calendar file as 18:00 UTC — which is 21:00 in Bucharest.
 *
 * Every confirmation email therefore carried an invite three hours late, and
 * because the browser-side "Add to calendar" button ran the same function on
 * the visitor's own machine, the two disagreed with each other as well.
 *
 * HOW THE CONVERSION WORKS
 *
 * There is no built-in "parse this time as if in zone X", so we work backwards
 * using Intl, which does know every zone's rules including daylight saving:
 *
 *   1. Pretend the wall clock is already UTC.
 *   2. Ask what that instant would show as on a clock in Bucharest.
 *   3. The gap between the two is the zone's offset at that moment.
 *   4. Subtract it.
 *
 * Worked example for 18:00 on 7 August (Romania is UTC+3 in summer):
 *   1. pretend  -> 18:00 UTC
 *   2. shown in Bucharest -> 21:00
 *   3. gap      -> +3 hours
 *   4. answer   -> 15:00 UTC, which is 18:00 in Bucharest. Correct.
 *
 * Deriving the offset from the date rather than hardcoding +2 or +3 is what
 * makes it survive the daylight-saving switch: the same event in December
 * resolves to 16:00 UTC instead.
 */
export function zonedWallClockToUtc(date: string, time: string, timeZone: string): Date {
  const asIfUtc = new Date(`${date}T${time}:00Z`);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    // h23 keeps midnight as 00 rather than 24, which some locales would return.
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(asIfUtc);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const shownInZone = Date.UTC(
    part("year"),
    part("month") - 1, // Date.UTC takes months 0-11
    part("day"),
    part("hour"),
    part("minute"),
    part("second")
  );

  const offsetMs = shownInZone - asIfUtc.getTime();
  return new Date(asIfUtc.getTime() - offsetMs);
}

/** Formats an instant as an iCalendar UTC timestamp, e.g. 20260807T150000Z. */
function formatICSDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * An event's start as a real instant, for anywhere that needs an unambiguous
 * timestamp — schema.org `startDate`, for instance.
 *
 * Exists so nobody hardcodes an offset. Writing `+03:00` is correct for Romania
 * in summer and an hour wrong every winter, because the country switches
 * between EET (UTC+2) and EEST (UTC+3). Deriving it from the date handles the
 * changeover automatically.
 */
export function eventStartInstant(date: string, time: string): Date {
  return zonedWallClockToUtc(date, time.slice(0, 5), EVENT_TIME_ZONE);
}

export function generateICS(event: {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  /**
   * Stable identifier for this event, ideally the database id.
   *
   * Calendar apps treat UID as the identity of an entry: send the same UID
   * twice and the second one updates the first, send a new one and they get a
   * duplicate. This used to be `Date.now()`, so someone who received both the
   * registration and the payment confirmation ended up with the same class
   * sitting in their calendar twice.
   */
  uid?: string;
}) {
  const start = zonedWallClockToUtc(
    event.date,
    event.time.slice(0, 5),
    EVENT_TIME_ZONE
  );
  const end = new Date(start.getTime() + ICS_DURATION_MINUTES * 60 * 1000);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Yoga Website//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid || `${event.date}-${event.time}`}@yoga-website`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${escapeICS(event.title)}`,
    `DESCRIPTION:${escapeICS(event.description)}`,
    `LOCATION:${escapeICS(event.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
