import type { ParticipantStatus } from "@/lib/admin/participants";
import { cn } from "@/lib/utils";

/**
 * A participant's status as a small coloured label, in the colours the events
 * list already uses: amber for what waits on her (a payment, a refund), green
 * for a paid seat, rose for the waiting list, grey for what is over.
 */
const STYLE: Record<ParticipantStatus, string> = {
  free: "bg-sage/15 text-sage-deep",
  paid: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  abandoned: "bg-charcoal/5 text-charcoal-light",
  refund_requested: "bg-warning/10 text-warning",
  refunded: "bg-charcoal/5 text-charcoal-light",
  cancelled: "bg-charcoal/5 text-charcoal-light",
  waitlist: "bg-rose/10 text-rose-deep",
  offers: "bg-rose/15 text-rose-deep",
  removed: "bg-charcoal/5 text-charcoal-light",
};

export function StatusChip({ status, label, className }: { status: ParticipantStatus; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", STYLE[status], className)}>
      {label}
    </span>
  );
}

const TIME_ZONE = "Europe/Bucharest";

/** A moment as a day: "3 oct. 2026". */
export function shortDay(iso: string, lang: "ro" | "en"): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ro-RO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

/** A moment as a day and an hour: "3 octombrie 2026, 14:02". */
export function longMoment(iso: string, lang: "ro" | "en"): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ro-RO", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

/** An event's stored day ("2026-10-10") as "10 oct. 2026", without any time zone moving it. */
export function eventDay(date: string, lang: "ro" | "en"): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ro-RO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
