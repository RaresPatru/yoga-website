import { Users } from "lucide-react";
import type { Availability } from "@/lib/event-availability";

/**
 * HOW ROMANIAN COUNTS THINGS, WHICH IS NOT HOW ENGLISH DOES
 *
 * English has two forms and the split is at one: "1 spot", "2 spots". Romanian
 * has three, and the second split is at nineteen:
 *
 *     1 loc liber            <- singular
 *     2..19 locuri libere    <- plural
 *     20 de locuri libere    <- plural, and the noun now takes `de`
 *
 * The rule keys off the last two digits rather than the number, so it comes
 * back round: 101 drops `de` again ("101 locuri libere", said "o sută unu
 * locuri") and 120 takes it back. That is Unicode's `few` and `other` for `ro`,
 * written out rather than pulled from a library because it is four lines and
 * this component deliberately owns its own strings — see below.
 *
 * None of this is hypothetical. Capacity is hers to set from the admin panel,
 * and an outdoor session in the park seats twenty without trying.
 */
function seatsLeftRo(left: number): string {
  if (left === 1) return "1 loc liber";
  const lastTwo = left % 100;
  // `de` once the last two digits leave the 1..19 window. Zero is excluded
  // because "0 locuri libere" is the short form too — though a count of zero
  // means the event is full and is handled before this is ever called.
  const de = left !== 0 && (lastTwo === 0 || lastTwo > 19) ? "de " : "";
  return `${left} ${de}locuri libere`;
}

/**
 * Seats remaining, or a sold-out marker.
 *
 * Shown wherever an event card appears — the home page and the events index —
 * because the home page demotes a full event below the bookable ones, and a
 * listing that gives no hint which is which makes that look arbitrary rather
 * than deliberate. Someone scanning the index should be able to see why the
 * soonest date is not the one being led with.
 *
 * IT OWNS ITS OWN WORDING, ON PURPOSE
 *
 * The two callers sit in different translation namespaces — the home page reads
 * `home`, the events index reads `events` — and those namespaces had two
 * different words for the same state: "Complet" and "Locuri epuizate". Passing
 * the label in meant the same event read differently depending on which page you
 * were on. Keeping the strings here means there is one vocabulary for one
 * concept. The `t(ro, en)` shape matches components/ui/phone-input.tsx, which
 * had the same problem first.
 *
 * The words here are the whole site's: the event page agrees, in its header
 * (app/[locale]/events/[slug]/page.tsx) and on the registration panel
 * (components/events/event-registration.tsx). Someone who reads "Locuri
 * epuizate" on a card and clicks it must not be told something else on the page
 * it opens — two names for one state reads as two different states.
 *
 * "Locuri epuizate" replaced "Complet", which had two problems. It was the same
 * word the site uses for a *full name* in every form it has ("Nume complet"),
 * and on its own it never said what was complete. `docs/ADMIN-GUIDE.md` had been
 * promising her "Locuri epuizate" the whole time.
 *
 * A Server Component: no state, no JavaScript shipped.
 */
export function SeatCount({
  info,
  locale,
  compact = false,
}: {
  info?: Availability;
  locale: string;
  compact?: boolean;
}) {
  /*
   * NO ROW IS NOT THE SAME AS NO SEATS.
   *
   * `event_availability` has a row for every published event, so an event with
   * nothing here means the count could not be read — a failed request, a policy
   * change — not that the event is full. Announcing "sold out" on a page-wide
   * read failure would tell every visitor that her whole calendar is closed,
   * which is the kind of invented fact this site does not state. Saying nothing
   * is the honest answer, and it is safe: register_for_event() re-reads the
   * capacity itself and refuses on its own terms, so a card that stays quiet
   * cannot sell a seat that does not exist.
   */
  if (!info) return null;

  const t = (ro: string, en: string) => (locale === "ro" ? ro : en);

  /*
   * A capacity of NULL or 0 is sold out, not unlimited.
   *
   * Blank means she has not said how many fit, and the safe reading of that is
   * "not open yet" rather than "open to everybody". Zero is her saying it is
   * already full — an event booked out through Instagram that still belongs on
   * the site, so the date is public and a place that frees up can be taken.
   * supabase/migrations/20260918000000_capacity_is_required.sql is where this
   * is actually enforced; everything here is presentation.
   */
  const isFull = !info.capacity || info.taken >= info.capacity;
  const left = info.capacity ? Math.max(info.capacity - info.taken, 0) : 0;

  return (
    <span
      className={`flex items-center gap-1.5 text-sm ${
        isFull ? "font-medium text-error" : "text-charcoal-light"
      }`}
    >
      <Users className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
      {isFull
        ? t("Locuri epuizate", "Sold out")
        : t(seatsLeftRo(left), `${left} ${left === 1 ? "spot" : "spots"} left`)}
    </span>
  );
}
