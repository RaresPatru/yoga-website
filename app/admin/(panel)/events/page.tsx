"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Plus, Search } from "lucide-react";
import { adminErrorKey } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import {
  eventStatus,
  listEvents,
  participantsHref,
  type EventStatus,
  type ListedEvent,
  type ParticipantFilter,
} from "@/lib/admin/events";
import { searchable } from "@/lib/admin/blog";
import { countSentence } from "@/lib/admin/plural";
import { buttonClasses } from "@/lib/button-styles";
import { formatEventSchedule, cn } from "@/lib/utils";
import { canOptimise } from "@/lib/image-src";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/ui/pagination";

/**
 * The events list: three tabs, searchable and sortable, 25 to a page, with the
 * whole view in the address (?tab=past&q=retreat&sort=title&page=2).
 *
 *   Următoare  Not started, under way, or over with a payment or refund still
 *              pending: everything that can still need her. It is the tab the
 *              list opens on, and what the dashboard's "Evenimente" counts.
 *   Ciorne     Never published.
 *   Trecute    Over, with nothing pending.
 *
 * Each row carries the event's numbers. The ones waiting on her come first
 * (waiting list, payments pending, refunds requested), then the two kept for
 * reference (offers awaiting a reply, refunded), and each opens Registrations
 * filtered to that event and group. A number that is zero is not shown, and
 * once an event is over its waiting list and offers are not either: nobody
 * can be offered a seat any more.
 */

const PER_PAGE = 25;
const TABS = ["upcoming", "drafts", "past"] as const;
type Tab = (typeof TABS)[number];
const SORTS = ["soonest", "latest", "edited", "title"] as const;
type Sort = (typeof SORTS)[number];

const TAB_OF: Record<EventStatus, Tab> = {
  draft: "drafts",
  upcoming: "upcoming",
  ongoing: "upcoming",
  ended_pending: "upcoming",
  archived: "past",
};

/** How each tab is sorted until she picks otherwise. */
const DEFAULT_SORT: Record<Tab, Sort> = { upcoming: "soonest", drafts: "edited", past: "latest" };

const STATUS_STYLE: Record<EventStatus, string> = {
  draft: "bg-charcoal/5 text-charcoal-light",
  upcoming: "bg-success/10 text-success",
  ongoing: "bg-sage/20 text-sage-deep",
  ended_pending: "bg-warning/10 text-warning",
  archived: "bg-charcoal/5 text-charcoal-light",
};

/** The five numbers, in the order the plan fixes: what waits on her, then what is kept for reference. */
const NUMBERS: { filter: ParticipantFilter; column: keyof NonNullable<ListedEvent["overview"]>; pending: boolean; whileOpen: boolean }[] = [
  { filter: "waitlist", column: "waiting", pending: true, whileOpen: true },
  { filter: "pending", column: "pending_payments", pending: true, whileOpen: false },
  { filter: "refund_requested", column: "refund_requested", pending: true, whileOpen: false },
  { filter: "offers", column: "offers_open", pending: false, whileOpen: true },
  { filter: "refunded", column: "refunded", pending: false, whileOpen: false },
];

function editedAt(event: ListedEvent): string {
  return event.draft_updated_at && event.draft_updated_at > event.updated_at ? event.draft_updated_at : event.updated_at;
}

function EventList() {
  const { t, locale } = useAdminLocale();
  useDocumentTitle(t("admin.events"));
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const lang: "ro" | "en" = locale === "en" ? "en" : "ro";

  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "upcoming";
  const sort: Sort = (SORTS as readonly string[]).includes(params.get("sort") ?? "")
    ? (params.get("sort") as Sort)
    : DEFAULT_SORT[tab];
  const query = params.get("q") ?? "";
  const requestedPage = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  /** This view's address with some settings changed. A new filter starts again at page 1. */
  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      const isDefault =
        value === null ||
        value === "" ||
        (key === "tab" && value === "upcoming") ||
        (key === "page" && value === "1");
      if (isDefault) next.delete(key);
      else next.set(key, value);
    }
    // A tab has its own default order, so changing tab forgets the chosen one.
    if ("tab" in changes) next.delete("sort");
    if (!("page" in changes)) next.delete("page");
    const search = next.toString();
    return search ? `${pathname}?${search}` : pathname;
  };

  // The search answers as she types and reaches the address a moment later,
  // replacing rather than adding a history entry for every letter.
  const [typed, setTyped] = useState(query);
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setTyped(query);
  }
  useEffect(() => {
    if (typed === query) return;
    const timer = window.setTimeout(() => router.replace(hrefWith({ q: typed.trim() || null }), { scroll: false }), 250);
    return () => window.clearTimeout(timer);
    // hrefWith reads the current params; re-running on them would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const { data: events = [], loading, error } = useAdminData(listEvents);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { upcoming: 0, drafts: 0, past: 0 };
    for (const event of events) c[TAB_OF[eventStatus(event)]]++;
    return c;
  }, [events]);

  const shown = useMemo(() => {
    const needle = searchable(typed.trim());
    const collator = new Intl.Collator("ro");
    return events
      .filter((event) => {
        if (TAB_OF[eventStatus(event)] !== tab) return false;
        if (!needle) return true;
        return [event.title_ro, event.title_en, event.location, event.slug].some((field) =>
          searchable(field).includes(needle)
        );
      })
      .sort((a, b) => {
        switch (sort) {
          case "latest":
            return b.starts_at.localeCompare(a.starts_at);
          case "edited":
            return editedAt(b).localeCompare(editedAt(a));
          case "title":
            return collator.compare(a.title_ro, b.title_ro);
          default:
            return a.starts_at.localeCompare(b.starts_at);
        }
      });
  }, [events, tab, sort, typed]);

  const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const page = Math.min(requestedPage, pageCount);
  const visible = shown.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const tabLabel = (value: Tab) => t(`admin.events_list.tab_${value}`);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("admin.events")}
        actions={
          <Link href="/admin/events/new" className={buttonClasses({ size: "sm" })}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> {t("admin.new_event")}
          </Link>
        }
      />

      <div className="mb-5 flex flex-col gap-3">
        <nav aria-label={t("admin.events_list.tabs")} className="-mx-1 overflow-x-auto px-1">
          <ul className="flex w-max gap-1 rounded-full border border-sage/25 bg-warm-white p-1">
            {TABS.map((value) => (
              <li key={value}>
                <Link
                  href={hrefWith({ tab: value })}
                  aria-current={tab === value ? "page" : undefined}
                  scroll={false}
                  className={cn(
                    "flex h-10 items-center gap-1.5 rounded-full px-3 text-sm transition-colors sm:gap-2 sm:px-4",
                    tab === value ? "bg-charcoal text-cream" : "text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
                  )}
                >
                  {tabLabel(value)}
                  <span className={cn("tabular-nums text-xs", tab === value ? "text-cream/75" : "text-charcoal-light/80")}>
                    {counts[value]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t("admin.events_list.search")}</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-light" aria-hidden="true" />
            <input
              type="search"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t("admin.events_list.search")}
              className="h-11 w-full rounded-full border border-sage/30 bg-white pl-10 pr-4 text-base text-charcoal placeholder:text-charcoal-light/60 sm:text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-charcoal-light">
            <span className="shrink-0">{t("admin.events_list.sort")}</span>
            <select
              value={sort}
              onChange={(e) => router.replace(hrefWith({ sort: e.target.value }), { scroll: false })}
              className="admin-select h-11 min-w-0 rounded-full sm:w-72 border border-sage/30 bg-white px-4 text-base text-charcoal sm:text-sm"
            >
              {SORTS.map((value) => (
                <option key={value} value={value}>
                  {t(`admin.events_list.sort_${value}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
          <span className="sr-only">{t("admin.loading")}</span>
        </div>
      ) : error ? (
        <p role="alert" className="text-error">
          {t(adminErrorKey(error))}
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-sage/40 px-6 py-10 text-center text-charcoal-light">
          {events.length === 0
            ? t("admin.events_list.empty")
            : typed.trim()
              ? t("admin.events_list.empty_search").replace("{query}", typed.trim())
              : t("admin.events_list.empty_tab").replace("{tab}", tabLabel(tab))}
        </p>
      ) : (
        <ul className="divide-y divide-sage/20 overflow-hidden rounded-2xl border border-sage/25 bg-warm-white">
          {visible.map((event) => (
            <EventRow key={event.id} event={event} lang={lang} />
          ))}
        </ul>
      )}

      <Pagination
        className="mt-8"
        page={page}
        pageCount={pageCount}
        href={(p) => hrefWith({ page: String(p) })}
        labels={{
          label: t("pagination.label"),
          previous: t("pagination.previous"),
          next: t("pagination.next"),
          page: (p) => t("pagination.page").replace("{page}", String(p)),
        }}
      />
    </div>
  );
}

function EventRow({ event, lang }: { event: ListedEvent; lang: "ro" | "en" }) {
  const { t } = useAdminLocale();
  const status = eventStatus(event);
  const schedule = formatEventSchedule(event, lang);
  const o = event.overview;
  const ended = status === "ended_pending" || status === "archived";
  const capacity = o?.capacity ?? event.max_participants;
  const taken = o?.taken ?? 0;

  // Status and seats: under the title on a phone, where a column beside it
  // would leave the title a few letters wide; beside it from a tablet up.
  const facts = (
    <>
      <span className={cn("rounded-full px-2 py-0.5 font-medium", STATUS_STYLE[status])}>
        {t(`admin.events_list.status_${status}`)}
      </span>
      {event.published && (
        <span className="tabular-nums">
          {capacity
            ? t("admin.events_list.seats").replace("{taken}", String(taken)).replace("{capacity}", String(capacity))
            : t("admin.events_list.seats_closed").replace("{taken}", String(taken))}
        </span>
      )}
    </>
  );

  const numbers = NUMBERS.filter((n) => !(ended && n.whileOpen))
    .map((n) => ({ ...n, value: Number(o?.[n.column] ?? 0) }))
    .filter((n) => n.value > 0);

  // The whole row opens the event, as a post's row does on the blog list. It
  // cannot be one link, because the numbers are links of their own, so the
  // title's link stretches a layer over the row (after:inset-0) and the
  // numbers sit above that layer. The row lights up, and takes the focus ring,
  // only while that link has the pointer or the keyboard: over a number, it is
  // the number that answers.
  return (
    <li className="relative px-4 py-3 transition-colors has-[[data-row-link]:hover]:bg-rose/5 has-[[data-row-link]:focus-visible]:outline-2 has-[[data-row-link]:focus-visible]:-outline-offset-2 has-[[data-row-link]:focus-visible]:outline-rose-deep">
      <div className="flex items-start gap-4">
        <Link
          href={`/admin/events/${event.id}`}
          data-row-link
          className="flex min-w-0 flex-1 items-center gap-4 after:absolute after:inset-0 focus-visible:outline-none"
        >
          <span className="relative aspect-[4/3] w-16 shrink-0 overflow-hidden rounded-lg bg-sage/10 sm:w-[4.5rem]">
            {event.image_url ? (
              <NextImage
                src={event.image_url}
                unoptimized={!canOptimise(event.image_url)}
                alt=""
                fill
                sizes="72px"
                className="object-cover"
              />
            ) : (
              <CalendarDays className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-sage-deep/60" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-serif text-lg leading-snug text-charcoal">
              {event.title_ro.trim() || t("admin.events_list.untitled")}
            </span>
            <span className="block truncate text-sm text-charcoal-light">
              {[schedule.date, schedule.time, event.location].filter(Boolean).join(", ")}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-charcoal-light sm:hidden">
              {facts}
            </span>
          </span>
        </Link>
        <span className="hidden shrink-0 flex-col items-end gap-1 text-xs text-charcoal-light sm:flex">{facts}</span>
      </div>

      {(numbers.length > 0 || event.draft_updated_at) && (
        <ul className="mt-2 flex flex-wrap gap-1.5 pl-20 sm:pl-[5.5rem]" aria-label={t("admin.events_list.numbers")}>
          {event.draft_updated_at && (
            <li className="rounded-full bg-rose/10 px-2.5 py-1 text-xs font-medium text-rose-deep">
              {t("admin.blog_list.unpublished_changes")}
            </li>
          )}
          {numbers.map((n) => (
            <li key={n.filter}>
              <Link
                href={participantsHref(event.id, n.filter)}
                className={cn(
                  "relative z-10 inline-flex min-h-8 items-center rounded-full px-2.5 text-xs font-medium transition-colors",
                  n.pending
                    ? "bg-warning/10 text-warning hover:bg-warning/20"
                    : "bg-charcoal/5 text-charcoal-light hover:bg-charcoal/10 hover:text-charcoal"
                )}
              >
                {countSentence(t, lang, `admin.event_numbers.${n.filter}`, n.value)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function AdminEventsPage() {
  // useSearchParams needs a boundary of its own (CLAUDE.md: keep boundaries
  // around the component that needs one).
  return (
    <Suspense>
      <EventList />
    </Suspense>
  );
}
