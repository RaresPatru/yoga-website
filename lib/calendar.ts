import { EVENT_TIME_ZONE, zonedWallClockToUtc } from "@/lib/utils";

/**
 * Everything this site knows about putting an event in somebody's calendar.
 *
 * Gathered into one module because it is one feature wearing three costumes —
 * an .ics file, a Google URL, an Outlook URL — and the three have to agree
 * about the same event down to the minute. They were spread across lib/utils.ts
 * and a component, which is how the emailed entry ended up ninety minutes long
 * while the downloaded one was correct.
 *
 * Nothing here touches the network or the database, so it runs equally on the
 * server (the .ics route, the confirmation email) and in the browser (the menu
 * on the event page).
 */

/**
 * How long an event is assumed to run when nobody has said.
 *
 * Only calendar output uses this, and only because an entry without an end is
 * not a valid entry. Nothing on the site *displays* a time derived from it —
 * `formatEventSchedule` shows the start alone rather than inventing an end,
 * because a printed end time is a promise about when somebody gets to leave
 * and a visitor cannot tell a stated one from a defaulted one.
 */
export const FALLBACK_DURATION_MINUTES = 90;

export interface CalendarEvent {
  title: string;
  description: string;
  /** `YYYY-MM-DD`, as stored. */
  date: string;
  /**
   * `HH:MM[:SS]`, a wall-clock time in Europe/Bucharest, or null.
   *
   * Null means she has not announced an hour. The entry then becomes an
   * all-day one, which is what a calendar app is for: it sits at the top of
   * the day rather than claiming a slot nobody has been told about.
   */
  time: string | null;
  /** Last day, `YYYY-MM-DD`. Null means it ends on the day it starts. */
  endDate?: string | null;
  /** `HH:MM[:SS]`. Null falls back to {@link FALLBACK_DURATION_MINUTES}. */
  endTime?: string | null;
  location: string;
  /** The event's page on this site, carried into the entry. */
  url?: string;
  /**
   * Stable identifier, ideally the database id.
   *
   * Calendar apps treat UID as the identity of an entry: send the same UID
   * twice and the second updates the first, send a new one and they get a
   * duplicate. This used to be `Date.now()`, so somebody who received both the
   * registration and the payment confirmation ended up with the same class
   * sitting in their calendar twice.
   */
  uid?: string;
}

/**
 * When the entry starts and stops, in the form the calendar format needs.
 *
 * Two shapes, because an event with no announced hour is a genuinely different
 * kind of entry rather than one starting at midnight. RFC 5545 has a form for
 * it -- a DATE-valued DTSTART -- and every calendar app renders that as a band
 * across the day instead of a slot, which is exactly right for "the retreat is
 * that weekend, times to follow".
 */
type Span =
  | { allDay: true; startDate: string; endDate: string }
  | { allDay: false; start: Date; end: Date };

/** `2026-10-26` plus n days, without going near a local timezone. */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function span(event: CalendarEvent): Span {
  if (!event.time) {
    /*
     * DTEND is *exclusive* for a DATE value: a one-day event on the 26th ends
     * on the 27th. Getting this wrong is the classic all-day bug -- the entry
     * renders a day short, so a Friday-to-Sunday retreat shows as Friday and
     * Saturday and somebody books a train home too early.
     */
    return {
      allDay: true,
      startDate: event.date,
      endDate: addDays(event.endDate || event.date, 1),
    };
  }

  const start = zonedWallClockToUtc(event.date, event.time.slice(0, 5), EVENT_TIME_ZONE);

  // Her stated end, where there is one: the end time on the end day, each
  // falling back to the start's own.
  let end: Date | null = null;
  if (event.endDate || event.endTime) {
    end = zonedWallClockToUtc(
      event.endDate || event.date,
      (event.endTime || event.time).slice(0, 5),
      EVENT_TIME_ZONE
    );
  }

  /*
   * An entry with no end, or one that ends before it starts, is not a valid
   * entry -- and unlike the page, the file cannot simply decline to say. The
   * database constraint already refuses a backwards range, so the second test
   * only catches a caller that assembled one by hand.
   */
  if (!end || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + FALLBACK_DURATION_MINUTES * 60 * 1000);
  }

  return { allDay: false, start, end };
}

/** `20261026` — iCalendar's basic DATE form. */
function icsDate(date: string): string {
  return date.replace(/-/g, "");
}


/** `20260918T153000Z` — iCalendar's basic UTC form, which Google also wants. */
function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newline are special in TEXT. */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line to 75 octets, as RFC 5545 §3.1 requires.
 *
 * THIS IS THE PART THAT WAS MISSING, AND IT BITES ON REAL DATA
 *
 * A description of any length produced one enormous line. Lenient parsers cope;
 * strict ones reject the entry outright, and the ones in between truncate it.
 * Her descriptions are a paragraph, so this was not a theoretical limit.
 *
 * Octets, not characters. "Practică" is eight characters and nine bytes, and a
 * limit counted in characters would emit lines over the wire limit while
 * looking correct. A fold may also never land *inside* a multi-byte character,
 * so this measures each character's encoded length and breaks before the one
 * that would push it over.
 *
 * A continuation line begins with a single space, which the parser removes on
 * unfolding — so the space is syntax, not content.
 */
function fold(line: string): string {
  const LIMIT = 75;
  const encoder = new TextEncoder();

  const out: string[] = [];
  let current = "";
  let bytes = 0;

  for (const character of line) {
    const size = encoder.encode(character).length;
    // Continuation lines spend one of their 75 octets on the leading space.
    const budget = out.length === 0 ? LIMIT : LIMIT - 1;
    if (bytes + size > budget) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += size;
  }
  out.push(current);

  return out.join("\r\n ");
}

/**
 * The event as an RFC 5545 calendar file.
 *
 * `METHOD:PUBLISH` rather than `REQUEST`: this is an announcement anybody may
 * add, not an invitation addressed to one person. `REQUEST` makes Outlook show
 * accept/decline buttons for a meeting nobody organised.
 */
export function generateICS(event: CalendarEvent): string {
  const when = span(event);
  const description = [event.description, event.url].filter(Boolean).join("\n\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Yoga Website//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid || `${event.date}-${event.time}`}@yoga-website`,
    `DTSTAMP:${icsStamp(new Date())}`,
    // A DATE value where she has not announced an hour, a UTC DATE-TIME
    // otherwise. The `VALUE=DATE` parameter is what tells the client this is an
    // all-day entry rather than a malformed timestamp.
    ...(when.allDay
      ? [
          `DTSTART;VALUE=DATE:${icsDate(when.startDate)}`,
          `DTEND;VALUE=DATE:${icsDate(when.endDate)}`,
        ]
      : [`DTSTART:${icsStamp(when.start)}`, `DTEND:${icsStamp(when.end)}`]),
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(event.location)}`,
    // Omitted rather than empty: a property with nothing after the colon is
    // malformed, and some clients reject the whole entry over one.
    ...(event.url ? [`URL:${escapeText(event.url)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // Trailing CRLF: the file is a sequence of content lines, each terminated.
  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * The event as a Google Calendar link.
 *
 * Google takes the fields as query parameters and opens a pre-filled "new
 * event" screen the visitor then saves. Dates are the same UTC basic form the
 * .ics uses; getting it wrong puts the class an hour out twice a year, which is
 * the whole reason `zonedWallClockToUtc` exists.
 */
export function googleCalendarUrl(event: CalendarEvent): string {
  const when = span(event);
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", event.title);
  /*
   * Google reads `dates` as all-day when both halves are bare dates and as a
   * timed slot when they carry a stamp. Its end is exclusive in the all-day
   * form too, which `span` has already accounted for.
   */
  url.searchParams.set(
    "dates",
    when.allDay
      ? `${icsDate(when.startDate)}/${icsDate(when.endDate)}`
      : `${icsStamp(when.start)}/${icsStamp(when.end)}`
  );
  url.searchParams.set("details", [event.description, event.url].filter(Boolean).join("\n\n"));
  url.searchParams.set("location", event.location);
  return url.toString();
}

/**
 * The event as an Outlook.com link.
 *
 * Outlook wants ISO 8601 with an offset rather than iCalendar's basic form, so
 * the same two instants are serialised a different way. `toISOString()` already
 * emits UTC with a `Z`, which Outlook accepts.
 *
 * This is the one that serves a desktop visitor who is not in Google's world —
 * on Windows, Outlook is the default calendar far more often than anything else.
 */
export function outlookCalendarUrl(event: CalendarEvent): string {
  const when = span(event);
  const url = new URL("https://outlook.live.com/calendar/0/deeplink/compose");
  url.searchParams.set("path", "/calendar/action/compose");
  url.searchParams.set("rru", "addevent");
  url.searchParams.set("subject", event.title);
  if (when.allDay) {
    // Outlook needs telling explicitly; without `allday` it reads the bare
    // dates as midnight-to-midnight and draws a slot instead of a band.
    url.searchParams.set("allday", "true");
    url.searchParams.set("startdt", when.startDate);
    url.searchParams.set("enddt", when.endDate);
  } else {
    url.searchParams.set("startdt", when.start.toISOString());
    url.searchParams.set("enddt", when.end.toISOString());
  }
  url.searchParams.set("body", [event.description, event.url].filter(Boolean).join("\n\n"));
  url.searchParams.set("location", event.location);
  return url.toString();
}
