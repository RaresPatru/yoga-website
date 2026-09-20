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

/** The shape every surface needs in order to say when an event happens. */
export interface EventSchedule {
  date: string;
  time: string | null;
  end_date: string | null;
  end_time: string | null;
}

/**
 * When an event happens, as the two strings a card puts beside its two icons.
 *
 * `date` always has something in it. `time` is null when there is no hour to
 * show, and the caller then renders no clock at all rather than an empty one.
 *
 *   one day, both hours     "23 septembrie 2026"      "18:30 - 20:00"
 *   one day, start only     "23 septembrie 2026"      "18:30"
 *   one day, no hours       "23 septembrie 2026"      null
 *   several days, hours     "26 - 28 octombrie 2026"  "09:00 - 17:00"
 *   several days, no hours  "26 - 28 octombrie 2026"  null
 *   crossing midnight       "7 - 8 noiembrie 2026"    "22:00 - 01:00"
 *
 * THE DATE AND THE HOURS ARE DECIDED SEPARATELY
 *
 * The date says which days it occupies; the hours say when it runs on them. A
 * retreat that starts on Friday and ends on Sunday, 09:00 to 17:00, is telling
 * you both — the days it takes up and the hours kept on each of them — and
 * there is no reason showing one should suppress the other.
 *
 * This is also what makes crossing midnight fall out rather than need handling.
 * A session from 22:00 to 01:00 has an end date of the following day, because
 * the database will not accept an end time before its start on the same date;
 * so the date half prints "7 - 8 noiembrie" and the hours half prints
 * "22:00 - 01:00", and neither had to know about the other.
 *
 * WHY AN END WITHOUT A START SHOWS NOTHING
 *
 * An hour to be somewhere is the useful half. "ends 17:00" with no start tells
 * a visitor nothing they can plan around, and printing it beside a date would
 * read as the start. She has said when it finishes and not when it begins,
 * which is a half-filled form rather than a fact worth publishing.
 *
 * The dash is an en dash with thin spaces either side, which is how a range is
 * set; a hyphen is for compound words and reads as a typo at this size. Both
 * are real characters rather than CSS, so a range survives being copied out of
 * the page into a message.
 */
export function formatEventSchedule(
  event: EventSchedule,
  locale: string = "ro"
): { date: string; time: string | null } {
  const spansDays = Boolean(event.end_date) && event.end_date !== event.date;
  const date = spansDays
    ? formatDateRange(event.date, event.end_date!, locale)
    : formatDate(event.date, locale);

  const start = event.time ? formatTime(event.time) : null;
  if (!start) return { date, time: null };

  const end = event.end_time ? formatTime(event.end_time) : null;
  return { date, time: end ? `${start}\u2009\u2013\u2009${end}` : start };
}

/**
 * A range of days, with whatever the two ends share said once.
 *
 * Repeating the month and the year on both sides is noise: "26 octombrie 2026
 * - 28 octombrie 2026" is twice the width to carry one extra number. Crossing a
 * month, or a new year, re-introduces exactly the part that changed and nothing
 * else.
 *
 * WHY THE TWO LANGUAGES BRANCH
 *
 * Only for a range inside one month, and only because the month sits on a
 * different side of the day in each. Romanian says "28 octombrie", so dropping
 * the shared month from the first date leaves "28 - 29 octombrie 2026" and the
 * numbers stay together. English says "October 28", so doing the same thing
 * leaves "28 - October 29, 2026" \u2014 which is what this used to print, and reads
 * as a fragment. English has to keep the month on the *first* date and drop it
 * from the second: "October 28 - 29, 2026".
 *
 * The other two branches need no such care. Once the month differs it is
 * printed on both sides anyway, so each date is simply formatted whole and
 * `Intl` puts its parts in the right order for the language.
 */
export function formatDateRange(start: string, end: string, locale: string = "ro"): string {
  const tag = locale === "ro" ? "ro-RO" : "en-US";
  const from = new Date(start);
  const to = new Date(end);

  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();

  const part = (date: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(tag, options).format(date);

  const dash = "\u2009\u2013\u2009";

  if (sameMonth) {
    // "October 28 - 29, 2026" \u2014 the year is appended rather than formatted with
    // the second day, because `Intl` given only a day and a year produces
    // "29 2026" with nothing between them.
    if (locale !== "ro") {
      return (
        part(from, { month: "long", day: "numeric" }) +
        dash +
        part(to, { day: "numeric" }) +
        `, ${to.getFullYear()}`
      );
    }

    // "26 - 28 octombrie 2026"
    return (
      part(from, { day: "numeric" }) +
      dash +
      part(to, { day: "numeric", month: "long", year: "numeric" })
    );
  }

  // "28 octombrie - 2 noiembrie 2026"
  if (sameYear) {
    return (
      part(from, { day: "numeric", month: "long" }) +
      dash +
      part(to, { day: "numeric", month: "long", year: "numeric" })
    );
  }

  // "28 decembrie 2026 - 2 ianuarie 2027"
  return formatDate(start, locale) + dash + formatDate(end, locale);
}


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

/**
 * An event's start as a real instant, for anywhere that needs an unambiguous
 * timestamp — schema.org `startDate`, for instance.
 *
 * Exists so nobody hardcodes an offset. Writing `+03:00` is correct for Romania
 * in summer and an hour wrong every winter, because the country switches
 * between EET (UTC+2) and EEST (UTC+3). Deriving it from the date handles the
 * changeover automatically.
 */
export function eventStartInstant(date: string, time: string | null): Date {
  /*
   * Midnight when she has not announced an hour yet.
   *
   * This is a sort key and a "has it happened" test, not something shown to
   * anyone — nothing prints 00:00, because `formatEventSchedule` returns a null
   * time for exactly this row and the clock is omitted. Midnight is the right
   * choice for both uses: an event with no stated hour sorts to the top of its
   * own day, and stays upcoming for the whole of that day rather than expiring
   * at an hour nobody was told about.
   */
  return zonedWallClockToUtc(date, (time ?? "00:00").slice(0, 5), EVENT_TIME_ZONE);
}