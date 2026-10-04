"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Megaphone, Search, Trash2, X } from "lucide-react";
import { adminErrorKey, toAdminError } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { useSelection } from "@/lib/admin/use-selection";
import { countSentence } from "@/lib/admin/plural";
import { slugify } from "@/lib/admin/blog";
import {
  PER_PAGE,
  STATUS_FILTERS,
  allParticipants,
  deleteParticipants,
  eventChoices,
  listParticipants,
  participantsById,
  type Participant,
  type ParticipantFilters,
  type ParticipantStatus,
  type ParticipantTab,
} from "@/lib/admin/participants";
import { downloadBlob, toCsv, toXlsx, type ExportColumn, type ExportFormat } from "@/lib/admin/export";
import { createAnnouncement, loadAnnouncement, setAnnouncementAudience } from "@/lib/admin/emails";
import type { Audience } from "@/lib/announcement-audience";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination } from "@/components/ui/pagination";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { PageHeader } from "@/components/admin/ui/page-header";
import { MenuButton } from "@/components/admin/ui/menu-button";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { useToast } from "@/components/admin/ui/toaster";
import { SelectionBar, selectionButton } from "@/components/admin/ui/selection-bar";
import { ParticipantPanel } from "@/components/admin/participants/participant-panel";
import { StatusChip, eventDay, shortDay } from "@/components/admin/participants/status-chip";

/**
 * Everyone who booked or is waiting, on one list: /admin/registrations.
 *
 *   Activi   Bookings and waiting-list entries that can still need her: the
 *            event has not ended, or something on the booking is pending (a
 *            payment inside its hour, a refund asked for).
 *   Arhivă   The rest: cancelled, or their event is over. Only here can rows
 *            be deleted for good.
 *
 * The whole view is in the address (?tab=archive&status=paid&event=<id>&q=ana
 * &page=2), so the dashboard and each number on an event open it already
 * filtered, and ?p=<id> opens one person's panel over it. The database does
 * the filtering and paging (lib/admin/participants.ts), 50 to a page.
 *
 * Announcements start here too: the people she ticks, or everyone matching
 * the filter, become a new announcement's recipients ("Scrie un anunț").
 * Arriving from an announcement's "Alege din Înscrieri"
 * (?announcement=<id>), the same button gives that draft its recipients
 * instead, and a banner says so.
 */

const TABS: readonly ParticipantTab[] = ["active", "archive"];

function Participants() {
  const { t, locale } = useAdminLocale();
  useDocumentTitle(t("admin.registrations"));
  const lang: "ro" | "en" = locale === "en" ? "en" : "ro";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();

  const tab: ParticipantTab = params.get("tab") === "archive" ? "archive" : "active";
  const status = (STATUS_FILTERS as readonly string[]).includes(params.get("status") ?? "")
    ? (params.get("status") as ParticipantStatus)
    : null;
  const eventId = params.get("event");
  const query = params.get("q") ?? "";
  const requestedPage = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const openId = params.get("p");
  const announcementId = params.get("announcement");

  /** This view's address with some settings changed. A new filter starts again at page 1. */
  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      const isDefault = value === null || value === "" || (key === "tab" && value === "active") || (key === "page" && value === "1");
      if (isDefault) next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes) && !("p" in changes)) next.delete("page");
    const search = next.toString();
    return search ? `${pathname}?${search}` : pathname;
  };

  // The search answers a moment after she stops typing, replacing the address
  // rather than adding a history entry per letter.
  const [typed, setTyped] = useState(query);
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setTyped(query);
  }
  useEffect(() => {
    if (typed === query) return;
    const timer = window.setTimeout(() => router.replace(hrefWith({ q: typed.trim() || null }), { scroll: false }), 300);
    return () => window.clearTimeout(timer);
    // hrefWith reads the current params; re-running on them would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const filters: ParticipantFilters = useMemo(
    () => ({ tab, status, eventId, q: query }),
    [tab, status, eventId, query]
  );
  const listKey = `${tab}|${status}|${eventId}|${query}`;
  const { data, loading, error, reload } = useAdminData(
    () => listParticipants(filters, requestedPage),
    `${listKey}|${requestedPage}`
  );
  const { data: events = [] } = useAdminData(eventChoices);
  const { data: announcement } = useAdminData(
    () => (announcementId ? loadAnnouncement(announcementId) : Promise.resolve(null)),
    announcementId ?? ""
  );
  const choosingFor = announcement?.status === "draft" ? announcement : null;
  const selection = useSelection(listKey);
  const [working, setWorking] = useState(false);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(requestedPage, pageCount);
  const pageIds = rows.map((r) => r.id);
  const pageSelected = pageIds.filter((id) => selection.ids.has(id)).length;
  const selectedCount = selection.allMatching ? total : selection.ids.size;
  const filtered = Boolean(status || eventId || query);
  const statusLabel = (s: ParticipantStatus) => t(`admin.participants.status_${s}`);

  /** Everyone the next action applies to: the ticked rows, or all who match. */
  const chosen = async (): Promise<Participant[]> =>
    selection.allMatching ? allParticipants(filters) : participantsById([...selection.ids]);

  const columns: ExportColumn<Participant>[] = [
    { header: t("admin.participants.col_name"), value: (p) => p.fullName, width: 26 },
    { header: t("admin.participants.col_email"), value: (p) => p.email, width: 30 },
    { header: t("admin.participants.col_phone"), value: (p) => p.phone, width: 18 },
    { header: t("admin.participants.col_event"), value: (p) => p.eventTitle, width: 32 },
    { header: t("admin.participants.col_event_date"), value: (p) => p.eventDate, width: 16 },
    { header: t("admin.participants.col_status"), value: (p) => statusLabel(p.status), width: 20 },
    { header: t("admin.participants.col_created"), value: (p) => spreadsheetMoment(p.createdAt), width: 18 },
    { header: t("admin.participants.col_language"), value: (p) => t(`admin.participants.language_${p.locale}`), width: 10 },
    {
      header: t("admin.participants.col_marketing"),
      value: (p) => t(p.marketingConsentAt ? "admin.participants.yes" : "admin.participants.no"),
      width: 13,
    },
  ];

  const exportAs = async (format: ExportFormat, fromSelection: boolean) => {
    setWorking(true);
    try {
      const people = fromSelection ? await chosen() : await allParticipants(filters);
      if (people.length === 0) {
        toast.info(t("admin.participants.export_empty"));
        return;
      }
      const eventTitle = eventId ? events.find((e) => e.id === eventId)?.title : null;
      const name = [t("admin.participants.file_name"), eventTitle && slugify(eventTitle), new Date().toISOString().slice(0, 10)]
        .filter(Boolean)
        .join("-");
      const blob =
        format === "csv" ? toCsv(people, columns) : await toXlsx(people, columns, t("admin.participants.sheet_name"));
      downloadBlob(blob, `${name}.${format}`);
      toast.success(t("admin.participants.exported").replace("{count}", String(people.length)));
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    } finally {
      setWorking(false);
    }
  };

  const deleteChosen = async () => {
    const count = selectedCount;
    const { confirmed } = await confirm({
      title: countSentence(t, lang, "admin.participants.delete_title", count),
      body: t("admin.participants.delete_body"),
      confirmLabel: t("admin.participants.delete_forever"),
      tone: "danger",
    });
    if (!confirmed) return;
    setWorking(true);
    try {
      const people = await chosen();
      const deleted = await deleteParticipants(people.map((p) => p.id));
      toast.success(t("admin.participants.deleted").replace("{count}", String(deleted)));
      selection.clear();
      reload();
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    } finally {
      setWorking(false);
    }
  };

  /**
   * The people ticked, or everyone matching the filter, as an announcement's
   * recipients: a new one, or the draft she came to choose them for.
   */
  const announce = async () => {
    const audience: Audience = selection.allMatching
      ? { kind: "filter", filters }
      : { kind: "ids", ids: [...selection.ids] };
    setWorking(true);
    try {
      if (choosingFor?.id) {
        await setAnnouncementAudience(choosingFor.id, audience);
        router.push(`/admin/emails/announcements/${choosingFor.id}`);
      } else {
        const id = await createAnnouncement(audience);
        router.push(`/admin/emails/announcements/${id}`);
      }
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
      setWorking(false);
    }
  };

  const exportItems = (fromSelection: boolean) => [
    { id: "xlsx", label: t("admin.participants.export_xlsx"), onSelect: () => void exportAs("xlsx", fromSelection) },
    { id: "csv", label: t("admin.participants.export_csv"), onSelect: () => void exportAs("csv", fromSelection) },
  ];

  const tabLabel = (value: ParticipantTab) => t(`admin.participants.tab_${value}`);
  const empty = filtered
    ? t("admin.participants.empty_filtered")
    : tab === "archive"
      ? t("admin.participants.empty_archive")
      : t("admin.participants.empty");

  return (
    <div className="mx-auto max-w-5xl pb-24">
      <PageHeader
        title={t("admin.registrations")}
        actions={
          <MenuButton
            label={t("admin.participants.export")}
            tooltip={t("admin.participants.export_hint")}
            align="end"
            items={exportItems(false)}
            triggerClassName="inline-flex h-10 items-center gap-1.5 rounded-full border border-sage/30 bg-white px-4 text-sm font-medium text-charcoal hover:bg-sage/10 disabled:opacity-50"
            trigger={
              <>
                <Download className="h-4 w-4" aria-hidden="true" />
                {t("admin.participants.export")}
              </>
            }
          />
        }
      />

      {choosingFor && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-rose-deep/25 bg-rose/10 px-5 py-4">
          <Megaphone className="h-5 w-5 shrink-0 text-rose-deep" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-charcoal">
            <strong className="font-medium">
              {t("admin.announce.choosing").replace("{subject}", choosingFor.subject_ro?.trim() || t("admin.announce.untitled"))}
            </strong>{" "}
            {t("admin.announce.choosing_hint")}
          </p>
          <Link
            href={`/admin/emails/announcements/${choosingFor.id}`}
            className="text-sm font-medium text-rose-deep underline decoration-rose-deep/40 underline-offset-2 hover:decoration-rose-deep"
          >
            {t("admin.announce.back_to_draft")}
          </Link>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3">
        <nav aria-label={t("admin.participants.tabs")} className="-mx-1 overflow-x-auto px-1">
          <ul className="flex w-max gap-1 rounded-full border border-sage/25 bg-warm-white p-1">
            {TABS.map((value) => (
              <li key={value}>
                <Link
                  href={hrefWith({ tab: value, p: null })}
                  aria-current={tab === value ? "page" : undefined}
                  scroll={false}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-full px-4 text-sm transition-colors",
                    tab === value ? "bg-charcoal text-cream" : "text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
                  )}
                >
                  {tabLabel(value)}
                  <span className={cn("tabular-nums text-xs", tab === value ? "text-cream/75" : "text-charcoal-light/80")}>
                    {data?.counts[value] ?? "–"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t("admin.participants.search")}</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-light" aria-hidden="true" />
            <input
              type="search"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t("admin.participants.search")}
              className="h-11 w-full rounded-full border border-sage/30 bg-white pl-10 pr-4 text-base text-charcoal placeholder:text-charcoal-light/60 sm:text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3 md:flex">
            <label className="min-w-0">
              <select
                aria-label={t("admin.participants.status")}
                value={status ?? ""}
                onChange={(e) => router.replace(hrefWith({ status: e.target.value || null }), { scroll: false })}
                className="admin-select h-11 w-full min-w-0 rounded-full border border-sage/30 bg-white px-4 text-base text-charcoal sm:text-sm md:w-52"
              >
                <option value="">{t("admin.participants.status_all")}</option>
                {STATUS_FILTERS.map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0">
              <select
                aria-label={t("admin.participants.event")}
                value={eventId ?? ""}
                onChange={(e) => router.replace(hrefWith({ event: e.target.value || null }), { scroll: false })}
                className="admin-select h-11 w-full min-w-0 rounded-full border border-sage/30 bg-white px-4 text-base text-charcoal sm:text-sm md:w-64"
              >
                <option value="">{t("admin.participants.event_all")}</option>
                {/* An event linked from elsewhere shows even before the list of choices arrives. */}
                {eventId && !events.some((e) => e.id === eventId) && <option value={eventId}>…</option>}
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}, {eventDay(e.date, lang)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {filtered && (
          <Link
            href={hrefWith({ status: null, event: null, q: null })}
            scroll={false}
            className="inline-flex w-max items-center gap-1 rounded-full px-3 py-1.5 text-sm text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" /> {t("admin.participants.clear")}
          </Link>
        )}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-10" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
          <span className="sr-only">{t("admin.loading")}</span>
        </div>
      ) : error ? (
        <p role="alert" className="text-error">
          {t(adminErrorKey(error))}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-sage/40 px-6 py-10 text-center text-charcoal-light">{empty}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-sage/25 bg-warm-white">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-sage/20 px-4 py-2.5 text-sm text-charcoal-light">
            <Checkbox
              label={t("admin.participants.select_page")}
              checked={pageSelected === pageIds.length}
              indeterminate={pageSelected > 0 && pageSelected < pageIds.length}
              onChange={(e) => selection.setMany(pageIds, e.target.checked)}
            />
            {pageSelected === pageIds.length && total > rows.length && (
              <p className="text-sm">
                {selection.allMatching ? (
                  t("admin.selection.all_selected").replace("{count}", String(total))
                ) : (
                  <>
                    {t("admin.selection.all_on_page").replace("{count}", String(rows.length))}{" "}
                    <button
                      type="button"
                      onClick={() => selection.setAllMatching(true)}
                      className="font-medium text-rose-deep underline underline-offset-2"
                    >
                      {t("admin.selection.select_all").replace("{count}", String(total))}
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
          <ul aria-label={t("admin.participants.list")} className="divide-y divide-sage/20">
            {rows.map((person) => (
              <ParticipantRow
                key={person.id}
                person={person}
                lang={lang}
                href={hrefWith({ p: person.id, page: page > 1 ? String(page) : null })}
                selected={selection.allMatching || selection.ids.has(person.id)}
                onSelect={(on) => selection.toggle(person.id, on)}
                statusLabel={statusLabel(person.status)}
              />
            ))}
          </ul>
        </div>
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

      <SelectionBar count={selectedCount} onClear={selection.clear}>
        <button type="button" disabled={working} onClick={announce} className={selectionButton()}>
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          {choosingFor ? t("admin.announce.use_selection") : t("admin.announce.write")}
        </button>
        <MenuButton
          label={t("admin.selection.export")}
          side="top"
          items={exportItems(true)}
          triggerClassName={selectionButton()}
          trigger={
            <>
              <Download className="h-4 w-4" aria-hidden="true" />
              {t("admin.participants.export")}
            </>
          }
        />
        {tab === "archive" && (
          <button type="button" disabled={working} onClick={deleteChosen} className={selectionButton(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t("admin.participants.delete_forever")}
          </button>
        )}
      </SelectionBar>

      {openId && (
        <ParticipantPanel
          key={openId}
          id={openId}
          onClose={() => router.replace(hrefWith({ p: null, page: page > 1 ? String(page) : null }), { scroll: false })}
          onOpen={(id) => router.replace(hrefWith({ p: id, page: page > 1 ? String(page) : null }), { scroll: false })}
          onChanged={reload}
        />
      )}
    </div>
  );
}

/** A moment as a spreadsheet sorts it: "2026-10-03 14:02", Romanian time. */
function spreadsheetMoment(iso: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bucharest",
  }).format(new Date(iso));
}

function ParticipantRow({
  person,
  lang,
  href,
  selected,
  onSelect,
  statusLabel,
}: {
  person: Participant;
  lang: "ro" | "en";
  href: string;
  selected: boolean;
  onSelect: (on: boolean) => void;
  statusLabel: string;
}) {
  const { t } = useAdminLocale();
  const when =
    person.status === "offers" && person.offerExpiresAt
      ? t("admin.participants.offer_until").replace("{date}", shortDay(person.offerExpiresAt, lang))
      : t(person.kind === "booking" ? "admin.participants.booked_on" : "admin.participants.waiting_since").replace(
          "{date}",
          shortDay(person.createdAt, lang)
        );

  // The whole row opens the person, as an event's row opens the event: the
  // name's link is stretched over the row, and the checkbox sits above it.
  return (
    <li
      className={cn(
        "relative flex items-start gap-3 px-4 py-3 transition-colors has-[[data-row-link]:hover]:bg-rose/5 has-[[data-row-link]:focus-visible]:outline-2 has-[[data-row-link]:focus-visible]:-outline-offset-2 has-[[data-row-link]:focus-visible]:outline-rose-deep",
        selected && "bg-rose/5"
      )}
    >
      <Checkbox
        className="relative z-10 mt-1"
        aria-label={t("admin.participants.select").replace("{name}", person.fullName)}
        checked={selected}
        onChange={(e) => onSelect(e.target.checked)}
      />
      <div className="grid min-w-0 flex-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_10.5rem]">
        <div className="min-w-0">
          <Link
            href={href}
            scroll={false}
            data-row-link
            className="block truncate font-serif text-lg leading-snug text-charcoal after:absolute after:inset-0 focus-visible:outline-none"
          >
            {person.fullName}
          </Link>
          <p className="truncate text-sm text-charcoal-light">
            {person.email}, {person.phone}
          </p>
        </div>
        <div className="min-w-0 text-sm">
          <p className="truncate text-charcoal">{person.eventTitle}</p>
          <p className="text-charcoal-light">{eventDay(person.eventDate, lang)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <StatusChip status={person.status} label={statusLabel} />
          <span className="text-xs text-charcoal-light">{when}</span>
        </div>
      </div>
    </li>
  );
}

export default function AdminRegistrationsPage() {
  // useSearchParams needs a boundary of its own (CLAUDE.md).
  return (
    <Suspense>
      <Participants />
    </Suspense>
  );
}
