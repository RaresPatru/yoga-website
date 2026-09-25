"use client";

import Link from "next/link";
import {
  Calendar,
  Check,
  ChevronRight,
  ExternalLink,
  FileText,
  MessageSquare,
  Plus,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { adminErrorKey, must } from "@/lib/admin/db";
import { countSentence } from "@/lib/admin/plural";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { buttonClasses } from "@/lib/button-styles";
import { cn, EVENT_TIME_ZONE, formatEventSchedule } from "@/lib/utils";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { PageHeader } from "@/components/admin/ui/page-header";

/**
 * The dashboard: what is waiting for her, and the next event.
 *
 * It works as a notification area more than a report. Each row says in a
 * sentence how many things of one kind there are ("2 plăți în așteptare") and
 * links to the list that shows them. A row where nothing is waiting says
 * "Totul la zi" in green instead of a zero, so the eye goes only to the rows
 * that need her. The counts come from the `admin_dashboard` view
 * (20260924000400_admin_dashboard.sql), which states each rule.
 *
 * Each link carries the filter its list will apply (`?status=pending`,
 * `?tab=drafts`, …). The lists learn to read them as each one is rebuilt in
 * the later phases of docs/OVERHAUL.md.
 */

type Tone = "todo" | "info";

interface DashboardRow {
  /** Also the sidebar label's key: `admin.<key>`. */
  key: string;
  /** The plural sentences, `admin.dash.<name>.one` and so on. */
  message: string;
  href: string;
  icon: LucideIcon;
  tone: Tone;
}

/**
 * The rows, in the sidebar's order. `todo` rows are things waiting on her:
 * they turn rose when there are any and say "Totul la zi" when there are none.
 * `info` rows (live events, her own drafts) are facts rather than tasks, so
 * they stay neutral either way.
 */
const ROWS = [
  { key: "events", message: "admin.dash.events", href: "/admin/events", icon: Calendar, tone: "info" },
  {
    key: "registrations",
    message: "admin.dash.payments",
    href: "/admin/registrations?status=pending",
    icon: Users,
    tone: "todo",
  },
  {
    key: "messages",
    message: "admin.dash.messages",
    href: "/admin/messages?filter=unread",
    icon: MessageSquare,
    tone: "todo",
  },
  {
    key: "testimonials",
    message: "admin.dash.testimonials",
    href: "/admin/testimonials?tab=pending",
    icon: Star,
    tone: "todo",
  },
  { key: "blog", message: "admin.dash.drafts", href: "/admin/blog?tab=drafts", icon: FileText, tone: "info" },
] as const satisfies ReadonlyArray<DashboardRow>;

type RowKey = (typeof ROWS)[number]["key"];

/** Today's date where her events happen, as YYYY-MM-DD. */
function todayInBucharest(now: Date): string {
  // en-CA writes dates as YYYY-MM-DD, the same shape as the `date` column.
  return new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TIME_ZONE }).format(now);
}

/** Whole days from one YYYY-MM-DD date to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** "Mâine", "Peste 5 zile", "Tomorrow": when the next event is, from today. */
function relativeDay(date: string, locale: "ro" | "en", now: Date): string {
  const days = daysBetween(todayInBucharest(now), date);
  const text = new Intl.RelativeTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
    numeric: "auto",
  }).format(days, "day");
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

export default function AdminDashboard() {
  const { t, locale } = useAdminLocale();
  useDocumentTitle(t("admin.dashboard"));

  const { data, loading, error } = useAdminData(async () => {
    const supabase = createClient();
    const now = new Date();

    const [counts, next] = await Promise.all([
      supabase.from("admin_dashboard").select("*").single(),
      // Soonest first among the events that have not ended, so one already
      // under way comes before one that has not started.
      supabase
        .from("events")
        .select("id, slug, title_ro, date, time, end_date, end_time, max_participants, starts_at")
        .eq("published", true)
        .gt("ends_at", now.toISOString())
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    const event = must(next);
    let seats: { taken: number; capacity: number | null } | null = null;
    let pending: { waiting: number; payments: number } | null = null;

    if (event) {
      const [availability, overview] = await Promise.all([
        supabase.from("event_availability").select("taken").eq("event_id", event.id).maybeSingle(),
        supabase
          .from("admin_event_overview")
          .select("waiting, pending_payments")
          .eq("event_id", event.id)
          .maybeSingle(),
      ]);
      seats = { taken: must(availability)?.taken ?? 0, capacity: event.max_participants };
      const o = must(overview);
      pending = { waiting: o?.waiting ?? 0, payments: o?.pending_payments ?? 0 };
    }

    const c = must(counts);
    const totals: Record<RowKey, number> = {
      events: c?.active_events ?? 0,
      registrations: c?.pending_payments ?? 0,
      messages: c?.unread_messages ?? 0,
      testimonials: c?.pending_testimonials ?? 0,
      blog: c?.draft_posts ?? 0,
    };

    return { totals, event, seats, pending, now };
  });

  const header = <PageHeader title={t("admin.dashboard")} />;

  if (error) {
    return (
      <div>
        {header}
        <p role="alert" className="text-error">
          {t(adminErrorKey(error))}
        </p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div>
        {header}
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
        </div>
      </div>
    );
  }

  const { totals, event, seats, pending, now } = data;
  const schedule = event ? formatEventSchedule(event, locale) : null;
  const started = event ? Date.parse(event.starts_at) <= now.getTime() : false;

  return (
    <div>
      {header}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <ul className="divide-y divide-sage/15 overflow-hidden rounded-2xl border border-sage/25 bg-warm-white">
          {ROWS.map(({ key, message, href, icon: Icon, tone }) => {
            const count = totals[key];
            const clear = tone === "todo" && count === 0;
            return (
              <li key={key}>
                <Link
                  href={href}
                  className="group flex min-h-16 items-center gap-4 px-4 py-3 transition-colors hover:bg-sage/10 sm:px-5"
                >
                  <Icon className="h-5 w-5 shrink-0 text-charcoal-light" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                    <span className="text-sm text-charcoal-light">{t(`admin.${key}`)}</span>
                    <span
                      className={cn(
                        "flex items-center gap-1.5",
                        tone === "todo" && count > 0 && "font-medium text-rose-deep",
                        clear && "text-sage-deep",
                        tone === "info" && "text-charcoal"
                      )}
                    >
                      {clear && <Check className="h-4 w-4" aria-hidden="true" />}
                      {countSentence(t, locale, message, count)}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-charcoal-light/60 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>

        <section
          aria-labelledby="next-event-heading"
          className="rounded-2xl border border-sage/25 bg-warm-white p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="next-event-heading" className="font-sans text-sm font-medium text-charcoal-light">
              {t("admin.dash.next_event")}
            </h2>
            {event && (
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  started ? "bg-sage/20 text-sage-deep" : "bg-rose/15 text-rose-deep"
                )}
              >
                {started ? t("admin.dash.happening_now") : relativeDay(event.date, locale, now)}
              </span>
            )}
          </div>

          {event && schedule && seats && pending ? (
            <>
              <p className="mt-3 break-words font-serif text-2xl leading-snug text-charcoal">
                {event.title_ro}
              </p>
              <p className="mt-1 text-sm text-charcoal-light">
                {schedule.time ? `${schedule.date}, ${schedule.time}` : schedule.date}
              </p>

              <dl className="mt-5 space-y-2.5 text-sm">
                <div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-charcoal-light">{t("admin.dash.seats")}</dt>
                    <dd className="font-medium text-charcoal">
                      {seats.capacity && seats.capacity > 0
                        ? t("admin.dash.seats_of")
                            .replace("{taken}", String(seats.taken))
                            .replace("{capacity}", String(seats.capacity))
                        : t("admin.dash.seats_closed").replace("{taken}", String(seats.taken))}
                    </dd>
                  </div>
                  {seats.capacity && seats.capacity > 0 ? (
                    // The numbers above are what a screen reader reads; this is
                    // the same fact drawn for the eye.
                    <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-sage/20">
                      <div
                        className="h-full rounded-full bg-sage-deep"
                        style={{ width: `${Math.min(100, (seats.taken / seats.capacity) * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-charcoal-light">{t("admin.dash.waiting")}</dt>
                  <dd className="font-medium text-charcoal">{pending.waiting}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-charcoal-light">{t("admin.dash.pending_payments")}</dt>
                  <dd className={cn("font-medium", pending.payments > 0 ? "text-rose-deep" : "text-charcoal")}>
                    {pending.payments}
                  </dd>
                </div>
              </dl>

              <a
                href={`/${locale}/events/${event.slug}`}
                target="_blank"
                rel="noopener"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-rose-deep underline-offset-4 hover:underline"
              >
                {t("admin.dash.view_page")}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t("admin.opens_new_tab")}</span>
              </a>
            </>
          ) : (
            <>
              <p className="mt-3 font-serif text-xl text-charcoal">{t("admin.dash.no_upcoming")}</p>
              <p className="mt-1 text-sm text-charcoal-light">{t("admin.dash.no_upcoming_hint")}</p>
            </>
          )}
        </section>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/admin/events?new=1" className={buttonClasses({ size: "sm" })}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("admin.new_event")}
        </Link>
        <Link href="/admin/blog/new" className={buttonClasses({ variant: "secondary", size: "sm" })}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("admin.new_post")}
        </Link>
      </div>
    </div>
  );
}
