"use client";

import Link from "next/link";
import { BellDot, Check } from "lucide-react";
import { formatPaid } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useAdminLocale } from "@/components/admin/locale-provider";
import type { Database } from "@/lib/database.types";

type NoticeRow = Pick<
  Database["public"]["Tables"]["admin_notifications"]["Row"],
  "id" | "kind" | "details" | "created_at" | "registration_id"
> & {
  registrations: { full_name: string } | null;
  events: { title_ro: string } | null;
};

export type { NoticeRow };

/** The columns the dashboard reads for a notice, with the booking's name and the event's title. */
export const NOTICE_COLUMNS =
  "id, kind, details, created_at, registration_id, registrations(full_name), events(title_ro)";

/** A moment as she reads it on the dashboard: "3 oct., 14:02". */
function when(iso: string, lang: "ro" | "en"): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ro-RO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bucharest",
  }).format(new Date(iso));
}

/** The sentence a notice says, from its kind and what it recorded. */
function sentence(notice: NoticeRow, t: (key: string) => string, lang: "ro" | "en"): string {
  const details = (notice.details ?? {}) as Record<string, unknown>;
  const name = notice.registrations?.full_name ?? (typeof details.name === "string" ? details.name : "");
  const event = notice.events?.title_ro ?? "";
  const amount =
    typeof details.amount === "number" ? formatPaid(details.amount, String(details.currency ?? "ron"), lang) : "";

  let key: string;
  switch (notice.kind) {
    case "cancelled":
      key = `admin.notices.cancelled_${typeof details.refund === "string" ? details.refund : "none"}`;
      break;
    case "payment_returned":
      key = details.reason === "paid_twice" ? "admin.notices.returned_twice" : "admin.notices.returned_no_seat";
      break;
    default:
      key = `admin.notices.${notice.kind}`;
  }
  return t(key)
    .replace("{name}", name || t("admin.notices.someone"))
    .replace("{event}", event)
    .replace("{amount}", amount);
}

/**
 * What happened on the site without her, at the top of the dashboard until
 * she has seen it (Rares, 3 October 2026: tell her whenever a refund is made
 * or a place opens up). Each notice links to the person's panel in Înscrieri,
 * where whatever it asks of her (a refund to decide, money to return) is one
 * press away. "Marchează ca văzute" clears the list; the notices themselves
 * stay in the database for 90 days after.
 */
export function Notices({
  notices,
  busy,
  onSeen,
}: {
  notices: NoticeRow[];
  busy: boolean;
  onSeen: () => void;
}) {
  const { t, locale } = useAdminLocale();
  const lang: "ro" | "en" = locale === "en" ? "en" : "ro";
  if (notices.length === 0) return null;

  return (
    <section aria-labelledby="notices-heading" className="mb-6 rounded-2xl border border-rose-deep/25 bg-rose/5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <h2 id="notices-heading" className="flex items-center gap-2 font-serif text-xl text-charcoal">
          <BellDot className="h-5 w-5 text-rose-deep" aria-hidden="true" />
          {t("admin.notices.title")}
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={onSeen}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-charcoal hover:bg-sage/15 disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {t("admin.notices.mark_seen")}
        </button>
      </div>
      <ul className="mt-2 divide-y divide-rose-deep/10">
        {notices.map((notice) => (
          <li key={notice.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:px-5">
            <p className="min-w-0 break-words text-sm text-charcoal">{sentence(notice, t, lang)}</p>
            <span className="flex shrink-0 items-baseline gap-3 text-xs text-charcoal-light">
              <time dateTime={notice.created_at}>{when(notice.created_at, lang)}</time>
              {notice.registration_id && (
                <Link
                  href={`/admin/registrations?p=${notice.registration_id}`}
                  className={cn("text-sm font-medium text-rose-deep underline decoration-rose-deep/40 underline-offset-2 hover:decoration-rose-deep")}
                >
                  {t("admin.notices.open")}
                  {/* Each link opens a different person: the name tells them apart for a screen reader. */}
                  <span className="sr-only"> {notice.registrations?.full_name}</span>
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
