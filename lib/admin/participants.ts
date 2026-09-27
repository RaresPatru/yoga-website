import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { AdminError, must } from "@/lib/admin/db";
import { searchable } from "@/lib/admin/blog";
import { getAuthToken } from "@/lib/get-auth-token";
import type { ParticipantAction, ParticipantActionResult } from "@/lib/admin/participant-actions";

/**
 * Reading and changing participants from the Registrations page.
 *
 * Everything is read from `admin_participants`
 * (supabase/migrations/20260928000000_participants.sql), which puts bookings
 * and the waiting list side by side and decides each row's status and whether
 * it is archived. Filtering, searching and paging happen in the database, 50 a
 * page, because this list only grows: every person who ever booked is in it.
 */

export type ParticipantStatus =
  | "free"
  | "paid"
  | "pending"
  | "abandoned"
  | "refund_requested"
  | "refunded"
  | "waitlist"
  | "offers"
  | "removed";

/** The statuses the filter offers, in the order the menu lists them. */
export const STATUS_FILTERS: readonly ParticipantStatus[] = [
  "free",
  "paid",
  "pending",
  "refund_requested",
  "refunded",
  "waitlist",
  "offers",
  "removed",
  "abandoned",
];

export type ParticipantTab = "active" | "archive";

export const PER_PAGE = 50;

type ViewRow = Database["public"]["Views"]["admin_participants"]["Row"];

export interface Participant {
  kind: "booking" | "waitlist";
  id: string;
  eventId: string;
  fullName: string;
  email: string;
  phone: string;
  locale: "ro" | "en";
  createdAt: string;
  status: ParticipantStatus;
  archived: boolean;
  eventTitle: string;
  eventDate: string;
  eventStartsAt: string;
  eventEndsAt: string;
  offerExpiresAt: string | null;
  refundRequestedAt: string | null;
  removedAt: string | null;
  removalReason: string | null;
  marketingConsentAt: string | null;
  participantNote: string | null;
  noteConsentAt: string | null;
  adminNote: string | null;
}

function participantOf(row: Partial<ViewRow>): Participant {
  return {
    kind: row.kind === "waitlist" ? "waitlist" : "booking",
    id: row.id ?? "",
    eventId: row.event_id ?? "",
    fullName: row.full_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    locale: row.locale === "en" ? "en" : "ro",
    createdAt: row.created_at ?? "",
    status: (row.status ?? "free") as ParticipantStatus,
    archived: Boolean(row.archived),
    eventTitle: row.event_title ?? "",
    eventDate: row.event_date ?? "",
    eventStartsAt: row.event_starts_at ?? "",
    eventEndsAt: row.event_ends_at ?? "",
    offerExpiresAt: row.offer_expires_at ?? null,
    refundRequestedAt: row.refund_requested_at ?? null,
    removedAt: row.removed_at ?? null,
    removalReason: row.removal_reason ?? null,
    marketingConsentAt: row.marketing_consent_at ?? null,
    participantNote: row.participant_note ?? null,
    noteConsentAt: row.note_consent_at ?? null,
    adminNote: row.admin_note ?? null,
  };
}

export interface ParticipantFilters {
  tab: ParticipantTab;
  status: ParticipantStatus | null;
  eventId: string | null;
  q: string;
}

/**
 * What the search box matches against the view's `search_text`: the words
 * lowercased and without accents, or, for something that looks like a phone
 * number, its digits without the leading zero of a national number, so
 * "0722 111 222" finds "+40 722 111 222". Null for an empty box.
 */
export function searchPattern(q: string): string | null {
  const trimmed = q.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (/^[\d\s+().\-/]+$/.test(trimmed) && digits.length >= 3) {
    return `%${digits.replace(/^0+/, "")}%`;
  }
  // % and _ are wildcards to LIKE; typed ones are meant literally.
  return `%${searchable(trimmed).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** The columns the list and the export need; the notes stay in the panel. */
const LIST_COLUMNS =
  "kind, id, event_id, full_name, email, phone, locale, created_at, status, archived, event_title, event_date, event_starts_at, event_ends_at, offer_expires_at, refund_requested_at, removed_at, marketing_consent_at";

type Filterable<Q> = Q & {
  eq: (column: string, value: string | boolean) => Filterable<Q>;
  ilike: (column: string, pattern: string) => Filterable<Q>;
};

/** The filters, applied to any query on the view. The tab is optional so the two counts can share it. */
function narrowed<Q>(query: Filterable<Q>, f: ParticipantFilters, tab: ParticipantTab | null): Filterable<Q> {
  let q = query;
  if (tab) q = q.eq("archived", tab === "archive");
  if (f.status) q = q.eq("status", f.status);
  if (f.eventId) q = q.eq("event_id", f.eventId);
  const pattern = searchPattern(f.q);
  if (pattern) q = q.ilike("search_text", pattern);
  return q;
}

export interface ParticipantPage {
  rows: Participant[];
  /** Everyone matching in the current tab, across pages. */
  total: number;
  counts: Record<ParticipantTab, number>;
}

export async function listParticipants(f: ParticipantFilters, page: number): Promise<ParticipantPage> {
  const supabase = createClient();
  const from = (page - 1) * PER_PAGE;
  const count = (tab: ParticipantTab) =>
    narrowed(supabase.from("admin_participants").select("id", { count: "exact", head: true }), f, tab);

  const [rows, active, archive] = await Promise.all([
    narrowed(supabase.from("admin_participants").select(LIST_COLUMNS, { count: "exact" }), f, f.tab)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + PER_PAGE - 1),
    count("active"),
    count("archive"),
  ]);
  if (rows.error) throw rows.error;
  if (active.error) throw active.error;
  if (archive.error) throw archive.error;
  return {
    rows: (rows.data ?? []).map(participantOf),
    total: rows.count ?? 0,
    counts: { active: active.count ?? 0, archive: archive.count ?? 0 },
  };
}

/** PostgREST answers at most 1,000 rows at a time, so a long list is read in pages. */
const CHUNK = 1000;

/** Everyone matching the filters in the current tab, for "select all" and for exporting. */
export async function allParticipants(f: ParticipantFilters): Promise<Participant[]> {
  const supabase = createClient();
  const out: Participant[] = [];
  for (let from = 0; ; from += CHUNK) {
    const chunk = must(
      await narrowed(supabase.from("admin_participants").select(LIST_COLUMNS), f, f.tab)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, from + CHUNK - 1)
    );
    out.push(...(chunk ?? []).map(participantOf));
    if (!chunk || chunk.length < CHUNK) return out;
  }
}

/** The given participants, in list order, for exporting a selection. */
export async function participantsById(ids: string[]): Promise<Participant[]> {
  const supabase = createClient();
  const out: Participant[] = [];
  // A hundred ids at a time keeps each address well under any length limit.
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = must(await supabase.from("admin_participants").select(LIST_COLUMNS).in("id", ids.slice(i, i + 100)));
    out.push(...(chunk ?? []).map(participantOf));
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** One participant with everything the panel shows, and every row under the same email. */
export async function loadParticipant(id: string): Promise<{ person: Participant; history: Participant[] } | null> {
  const supabase = createClient();
  const row = must(await supabase.from("admin_participants").select("*").eq("id", id).maybeSingle());
  if (!row) return null;
  const person = participantOf(row);
  const history = must(
    await supabase
      .from("admin_participants")
      .select(LIST_COLUMNS)
      .eq("email_key", person.email.toLowerCase())
      .order("event_starts_at", { ascending: false })
  );
  return { person, history: (history ?? []).map(participantOf) };
}

/** Her own note, written straight to the row: nothing else happens when it changes. */
export async function saveAdminNote(person: Pick<Participant, "kind" | "id">, note: string): Promise<void> {
  const supabase = createClient();
  const value = note.trim() ? note : null;
  const result =
    person.kind === "booking"
      ? await supabase.from("registrations").update({ admin_note: value }).eq("id", person.id).select("id")
      : await supabase.from("waiting_list").update({ admin_note: value }).eq("id", person.id).select("id");
  const rows = must(result);
  if (!rows?.length) throw new AdminError("unknown", "The participant was not found; they may have been deleted.");
}

/** Deletes archived participants for good. The database skips anyone who is not archived. */
export async function deleteParticipants(ids: string[]): Promise<number> {
  const supabase = createClient();
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 500) {
    deleted += must(await supabase.rpc("admin_delete_participants", { p_ids: ids.slice(i, i + 500) })) ?? 0;
  }
  return deleted;
}

/** A change that sends email or frees a seat, made by the server (/api/admin/participants/[id]). */
export async function participantAction(
  id: string,
  action: ParticipantAction,
  extra: { reason?: string; email?: boolean } = {}
): Promise<ParticipantActionResult> {
  const response = await fetch(`/api/admin/participants/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getAuthToken()}` },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw new AdminError("session", "Not signed in as the admin");
  if (!response.ok) throw new AdminError(response.status === 409 ? "invalid" : "unknown", data.error ?? "Failed");
  return data as ParticipantActionResult;
}

/** The events the filter can choose from, newest first. */
export async function eventChoices(): Promise<{ id: string; title: string; date: string }[]> {
  const rows = must(
    await createClient()
      .from("events")
      .select("id, title_ro, date")
      .eq("published", true)
      .order("starts_at", { ascending: false })
  );
  return (rows ?? []).map((e) => ({ id: e.id, title: e.title_ro, date: e.date }));
}
