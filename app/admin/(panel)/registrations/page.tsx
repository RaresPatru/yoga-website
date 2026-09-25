"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { adminErrorKey, must } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import type { ParticipantFilter } from "@/lib/admin/events";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { PageHeader } from "@/components/admin/ui/page-header";

/**
 * Everyone who booked, newest first, searchable by name or email.
 *
 * The address can narrow it (?event=<id>&status=<group>), which is how each
 * number on an event opens its people: the waiting list, payments pending,
 * refunds requested, offers awaiting a reply, or refunds made. Those groups
 * are defined exactly as admin_event_overview counts them, so the number on
 * the event and the length of this list agree. The waiting-list groups list
 * the waiting list rather than bookings.
 *
 * Phase 5 of docs/OVERHAUL.md replaces this page with one list of bookings
 * and waiting list together; this is the part that phase 4 needs.
 */

const FILTERS: readonly ParticipantFilter[] = ["waitlist", "pending", "refund_requested", "offers", "refunded"];
/** How long an unpaid checkout holds its seat: pending_hold_interval() in the database. */
const HOLD_MS = 60 * 60 * 1000;

interface Registration {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  payment_status: string;
  created_at: string;
  refund_requested_at: string | null;
  removed_at: string | null;
  event_id: string;
  events: { title_ro: string; date: string } | null;
}

interface WaitingEntry {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  created_at: string;
  claim_expires_at: string | null;
  event_id: string;
  events: { title_ro: string; date: string } | null;
}

function matches(r: Registration, filter: ParticipantFilter | null, now: number): boolean {
  if (!filter) return true;
  if (filter === "refunded") return r.payment_status === "refunded";
  if (r.removed_at) return false;
  if (filter === "pending") return r.payment_status === "pending" && now - Date.parse(r.created_at) < HOLD_MS;
  if (filter === "refund_requested") return Boolean(r.refund_requested_at) && r.payment_status !== "refunded";
  return false;
}

function Registrations() {
  const { t, locale } = useAdminLocale();
  useDocumentTitle(t("admin.registrations"));
  const params = useSearchParams();
  const eventId = params.get("event");
  const status = (FILTERS as readonly string[]).includes(params.get("status") ?? "")
    ? (params.get("status") as ParticipantFilter)
    : null;
  const waitingGroup = status === "waitlist" || status === "offers";
  const [search, setSearch] = useState("");
  const [loadedAt] = useState(() => Date.now());

  const { data, loading, error } = useAdminData(async () => {
    const supabase = createClient();
    const eventTitle = eventId
      ? must(await supabase.from("events").select("title_ro").eq("id", eventId).maybeSingle())?.title_ro ?? null
      : null;

    if (waitingGroup) {
      let query = supabase
        .from("waiting_list")
        .select("id, full_name, email, phone, created_at, claim_expires_at, event_id, events:event_id(title_ro, date)")
        .is("claimed_at", null)
        .is("removed_at", null)
        .order("created_at", { ascending: true });
      if (eventId) query = query.eq("event_id", eventId);
      return { eventTitle, registrations: [] as Registration[], waiting: (must(await query) ?? []) as unknown as WaitingEntry[] };
    }

    let query = supabase
      .from("registrations")
      .select("id, full_name, email, phone, payment_status, created_at, refund_requested_at, removed_at, event_id, events:event_id(title_ro, date)")
      .order("created_at", { ascending: false });
    if (eventId) query = query.eq("event_id", eventId);
    return { eventTitle, registrations: (must(await query) ?? []) as unknown as Registration[], waiting: [] as WaitingEntry[] };
  }, `${eventId}:${status}`);

  const needle = search.trim().toLowerCase();
  const found = (p: { full_name: string; email: string }) =>
    !needle || p.full_name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle);

  const registrations = useMemo(
    () => (data?.registrations ?? []).filter((r) => matches(r, status, loadedAt)),
    [data, status, loadedAt]
  );
  const waiting = useMemo(
    () =>
      (data?.waiting ?? []).filter((w) => {
        const offerOpen = Boolean(w.claim_expires_at && Date.parse(w.claim_expires_at) > loadedAt);
        return status === "offers" ? offerOpen : !offerOpen;
      }),
    [data, status, loadedAt]
  );

  const shownRegistrations = registrations.filter(found);
  const shownWaiting = waiting.filter(found);
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "ro-RO");

  const statusColor: Record<string, string> = {
    free: "bg-sage/10 text-sage-deep",
    completed: "bg-success/10 text-success",
    pending: "bg-warning/10 text-warning",
    refunded: "bg-error/10 text-error",
  };
  const statusLabelKey: Record<string, string> = {
    free: "admin.free",
    completed: "admin.paid",
    pending: "admin.pending",
    refunded: "admin.refunded",
  };

  const chip = "inline-flex items-center gap-1.5 rounded-full bg-rose/10 px-3 py-1.5 text-sm text-rose-deep";

  return (
    <div>
      <PageHeader title={t("admin.registrations")} />

      {(eventId || status) && (
        <div className="mb-4 flex flex-wrap items-center gap-2" aria-label={t("admin.participants_filter.label")}>
          {eventId && data?.eventTitle && (
            <span className={chip}>{t("admin.participants_filter.event").replace("{title}", data.eventTitle)}</span>
          )}
          {status && <span className={chip}>{t(`admin.participants_filter.status_${status}`)}</span>}
          <Link
            href="/admin/registrations"
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" /> {t("admin.participants_filter.clear")}
          </Link>
        </div>
      )}

      <Input
        placeholder={t("admin.search_name_email")}
        aria-label={t("admin.search_name_email")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="mt-8 flex justify-center" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
          <span className="sr-only">{t("admin.loading")}</span>
        </div>
      ) : error ? (
        <p role="alert" className="mt-6 text-error">
          {t(adminErrorKey(error))}
        </p>
      ) : waitingGroup ? (
        shownWaiting.length === 0 ? (
          <p className="mt-6 text-charcoal-light">{t("admin.participants_filter.none")}</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {shownWaiting.map((entry) => (
              <li key={entry.id}>
                <GlassCard hover={false}>
                  <p className="font-medium text-charcoal">{entry.full_name}</p>
                  <p className="text-sm text-charcoal-light">
                    {entry.email}, {entry.phone}
                  </p>
                  <p className="text-sm text-charcoal-light">{entry.events?.title_ro}</p>
                  <p className="mt-1 text-xs text-charcoal-light">
                    {status === "offers" && entry.claim_expires_at
                      ? t("admin.participants_filter.offer_until").replace("{date}", date(entry.claim_expires_at))
                      : t("admin.participants_filter.waiting_since").replace("{date}", date(entry.created_at))}
                  </p>
                </GlassCard>
              </li>
            ))}
          </ul>
        )
      ) : shownRegistrations.length === 0 ? (
        <p className="mt-6 text-charcoal-light">{status ? t("admin.participants_filter.none") : t("admin.no_registrations")}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {shownRegistrations.map((reg) => (
            <li key={reg.id}>
              <GlassCard hover={false}>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-charcoal">{reg.full_name}</p>
                    <p className="break-words text-sm text-charcoal-light">
                      {reg.email}, {reg.phone}
                    </p>
                    <p className="text-sm text-charcoal-light">
                      {reg.events?.title_ro}, {reg.events?.date}
                    </p>
                    {reg.refund_requested_at && reg.payment_status !== "refunded" && (
                      <p className="mt-1 text-xs text-warning">
                        {t("admin.participants_filter.refund_requested_on").replace("{date}", date(reg.refund_requested_at))}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                      statusColor[reg.payment_status] || "bg-charcoal-light/10 text-charcoal-light"
                    }`}
                  >
                    {t(statusLabelKey[reg.payment_status] || reg.payment_status)}
                  </span>
                </div>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminRegistrationsPage() {
  // useSearchParams needs a boundary of its own (CLAUDE.md).
  return (
    <Suspense>
      <Registrations />
    </Suspense>
  );
}
