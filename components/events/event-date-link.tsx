"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { CalendarPlus } from "lucide-react";
import { META_LINK } from "@/lib/meta-link";
import { googleCalendarUrl, outlookCalendarUrl, type CalendarEvent } from "@/lib/calendar";
import {
  currentPlatform,
  SERVER_PLATFORM,
  type CalendarKind,
  type Platform,
} from "@/lib/platform";

/** The user agent cannot change while the page is open, so there is nothing to
 *  subscribe to. Hoisted so the reference is stable across renders — an inline
 *  one would make React resubscribe on every one of them. */
const noSubscription = () => () => {};

/**
 * The event's date, which is also how you put the event in your calendar.
 *
 * WHY THE DATE AND NOT A BUTTON
 *
 * There was an "Add to calendar" button in a row underneath, beside a "View
 * location" button and an Instagram download. Three buttons for things the page
 * already said in its meta row, or did not need to say at all. Putting each
 * action on the noun it acts on removed the row: the date adds the date, the
 * address opens the map.
 *
 * WHY A MENU RATHER THAN ONE DESTINATION
 *
 * It used to pick a single destination from the user agent — .ics on Apple,
 * Google elsewhere — and that is the version that strands people. An iPhone
 * owner who lives in Google Calendar was given a file for an app they do not
 * use, with no way to say otherwise, and a Windows visitor who uses Outlook got
 * Google. Detection is now only an *ordering*: every option is always present,
 * so when the sniff is wrong the cost is a slightly odd order rather than a
 * feature that does not work. See lib/platform.ts.
 *
 * WHAT EACH ONE DOES
 *
 *   Apple Calendar   navigates to /api/calendar/event/[slug], which answers
 *                    `text/calendar`. iOS and macOS hand that straight to the
 *                    Calendar app, which opens its own "Add Event" sheet,
 *                    pre-filled. On Android and desktop it lands as a file the
 *                    calendar app can import.
 *   Google, Outlook  a pre-filled "new event" page in a new tab.
 *
 * None of them saves anything without the visitor confirming, which is correct:
 * a page that silently wrote to your calendar is a page you would stop trusting.
 *
 * INSIDE INSTAGRAM
 *
 * Almost everyone here arrives from an Instagram link, so the page is usually
 * running in a web view embedded in another app. Those are the least reliable
 * place to hand a file to the operating system — the view can swallow the
 * navigation, or put the .ics somewhere the visitor will never find. So in an
 * in-app browser Google Calendar is listed first: it is an ordinary page
 * navigation, which is the one thing every embedded browser can still do. The
 * .ics sits directly underneath for anybody who wants it.
 *
 * WHY `<details>` AND NOT `popover`
 *
 * `showPopover()` throws below Safari 17 — written out at length in
 * app/globals.css over the navigation drawer — and the newer anchor positioning
 * has no Safari at all. `<details>` needs no JavaScript to open, is keyboard
 * operable out of the box, and if everything else fails it degrades to an open
 * list of three working links.
 */
export function EventDateLink({
  slug,
  locale,
  dateText,
  event,
  addLabel,
  appleLabel,
}: {
  slug: string;
  locale: string;
  /** Already formatted on the server, so both sides render the same string. */
  dateText: string;
  event: CalendarEvent;
  /** "Adaugă în calendar" — the tooltip, and part of the accessible name. */
  addLabel: string;
  /** "Apple Calendar (.ics)" — the only option whose name is not a brand. */
  appleLabel: string;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  /*
   * `useSyncExternalStore` rather than an effect that calls setState, which is
   * the cascading-render antipattern the linter rejects — and this is the case
   * the hook exists for: a value that lives outside React, is read during
   * render, and differs between the server and the browser.
   */
  const platform = useSyncExternalStore(
    noSubscription,
    currentPlatform,
    () => SERVER_PLATFORM
  );

  const choices: Record<CalendarKind, { href: string; label: string; external: boolean }> = {
    apple: {
      // The route rather than a blob built here. A Blob produces a *file*, and
      // a file is the one thing an iPhone cannot do much with — it lands in
      // Files and has to be hunted down. A URL answering `text/calendar` opens
      // the Calendar sheet instead. A `data:` URI is not an option either:
      // browsers refuse top-level navigation to one.
      href: `/api/calendar/event/${slug}?locale=${locale}`,
      label: appleLabel,
      external: false,
    },
    google: { href: googleCalendarUrl(event), label: "Google Calendar", external: true },
    outlook: { href: outlookCalendarUrl(event), label: "Outlook", external: true },
  };

  // Escape closes it, and so does a press anywhere else. `<details>` does
  // neither on its own — it only toggles from its own summary, which on a phone
  // means a panel that follows you down the page until you find it again.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const close = (domEvent: Event) => {
      if (!menu.open) return;
      if (domEvent.type === "pointerdown" && menu.contains(domEvent.target as Node)) return;
      if (domEvent.type === "keydown" && (domEvent as KeyboardEvent).key !== "Escape") return;
      menu.open = false;
      // Escape should leave focus somewhere real rather than on nothing.
      if (domEvent.type === "keydown") menu.querySelector("summary")?.focus();
    };

    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={menuRef} className="event-calendar relative">
      <summary
        data-tooltip={addLabel}
        /*
         * The visible date is inside the accessible name rather than replaced
         * by it. `aria-label="Adaugă în calendar"` alone would be a WCAG 2.5.3
         * failure — the name has to contain the visible label — and would take
         * the date away from anybody listening to the page.
         */
        aria-label={`${dateText} — ${addLabel}`}
        className={`${META_LINK} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        {/*
          `CalendarPlus`, not `Calendar`. A plain calendar icon beside a date
          says "this is a date", which is the one thing the date already says.
          The plus is the part that signals the text does something — the only
          affordance that survives on a phone, where there is no hover to
          explain anything and the tooltip never appears.
        */}
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
        {dateText}
      </summary>

      {/*
        Opaque, and no backdrop blur — unlike GlassCard, which this otherwise
        resembles. A card sits on the flat page; this sits on top of the
        address and the description, and at 95% white their text ghosted
        through it legibly enough to look like a rendering fault.

        The blur would not have saved it either. CLAUDE.md records the
        measurement: blurring a flat backdrop returns the same flat backdrop,
        while promoting the element to its own compositing layer and costing
        Chrome's subpixel antialiasing — background pixels moved 11/255, text
        pixels up to 82/255. Paying for worse text to hide nothing.
      */}
      <div className="event-calendar-panel absolute left-0 top-full z-30 mt-2 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-sage/30 bg-warm-white shadow-lg shadow-black/10">
        {/* A real list, so assistive tech announces how many choices there are
            and offers one gesture to skip past them. */}
        <ul role="list">
          {order(platform).map((kind) => {
            const choice = choices[kind];
            return (
              <li key={kind}>
                <a
                  href={choice.href}
                  // The web calendars leave the site and open alongside it, so
                  // somebody who came to read about the class still has it open
                  // when they come back. The .ics is ours and is a hand-off to
                  // the operating system, not a page to visit.
                  target={choice.external ? "_blank" : undefined}
                  rel={choice.external ? "noopener noreferrer" : undefined}
                  className="block px-4 py-3 text-sm text-charcoal transition-colors hover:bg-sage/10 active:bg-sage/15"
                  onClick={() => {
                    if (menuRef.current) menuRef.current.open = false;
                  }}
                >
                  {choice.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}

/**
 * Which calendar is offered first. Ordering only — every list has all three.
 *
 * An Apple device that is not inside another app gets its own Calendar at the
 * top. Inside Instagram the .ics drops to second, behind the option that is an
 * ordinary page navigation. Anywhere else Google leads and Outlook follows,
 * because on Windows Outlook is the default calendar far more often than
 * anything Apple makes.
 */
function order(platform: Platform): readonly CalendarKind[] {
  if (!platform.apple) return ["google", "outlook", "apple"];
  return platform.inApp
    ? ["google", "apple", "outlook"]
    : ["apple", "google", "outlook"];
}
