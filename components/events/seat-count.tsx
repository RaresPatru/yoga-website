import { Users } from "lucide-react";
import type { Availability } from "@/lib/event-availability";

/**
 * Seats remaining, or a "full" marker. Nothing at all for an uncapped event.
 *
 * Shown wherever an event card appears — the home page and the events index —
 * because the home page now demotes a full event below the bookable ones, and a
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
 * were on. Keeping the three strings here means there is one vocabulary for one
 * concept. The `t(ro, en)` shape matches components/ui/phone-input.tsx, which
 * had the same problem first.
 *
 * The words here are the whole site's: the event page agrees, in its header
 * (app/[locale]/events/[slug]/page.tsx) and on the registration panel
 * (components/events/event-registration.tsx). Someone who reads "Complet" on a
 * card and clicks it must not be told "Locuri epuizate" on the page it opens —
 * two names for one state reads as two different states. The `events.*` keys
 * that carried the old wording were deleted so there is nothing to drift back
 * to.
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
  // An event with no capacity is uncapped, and "unlimited seats left" is not
  // information — it is noise on every card that has no limit.
  if (!info?.capacity) return null;

  const t = (ro: string, en: string) => (locale === "ro" ? ro : en);
  const isFull = info.taken >= info.capacity;
  const left = Math.max(info.capacity - info.taken, 0);

  return (
    <span
      className={`flex items-center gap-1.5 text-sm ${
        isFull ? "font-medium text-error" : "text-charcoal-light"
      }`}
    >
      <Users className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
      {isFull
        ? t("Complet", "Full")
        : t(`${left} locuri libere`, `${left} spots left`)}
    </span>
  );
}
