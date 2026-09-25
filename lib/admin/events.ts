import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { AdminError, must } from "@/lib/admin/db";
import { DEFAULT_CURRENCY } from "@/lib/money";

/**
 * Reading and writing events from the admin: the list, and the editor's
 * autosave and publishing. The same lifecycle as a blog post (lib/admin/blog.ts):
 *
 *   never published  Every save writes straight to the event, which nobody
 *                    can see (the read policy wants `published`).
 *   published        Saves go to its row in `content_drafts`, so visitors keep
 *                    seeing the published event until "Publică modificările"
 *                    (publish_event_draft, in
 *                    supabase/migrations/20260927000000_registration_lifecycle.sql).
 *
 * `show_in_archive` is not a draft change: it applies at once, like hiding a
 * post. Once a published event has ended, its date, times, price and places
 * are locked, in the editor and in publish_event_draft().
 */

export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export type EventOverview = Database["public"]["Views"]["admin_event_overview"]["Row"];

/** What the admin list and the editor call an event's state. */
export type EventStatus = "draft" | "upcoming" | "ongoing" | "ended_pending" | "archived";

/** The fields the editor writes, in both of the places a save can go. */
export const EVENT_FIELDS = [
  "slug",
  "title_ro",
  "title_en",
  "description_ro",
  "description_en",
  "date",
  "time",
  "end_date",
  "end_time",
  "location",
  "map_link",
  "price",
  "currency",
  "max_participants",
  "image_url",
  "whatsapp_group_link",
] as const;

export interface EventFields {
  slug: string;
  title_ro: string;
  title_en: string | null;
  description_ro: string | null;
  description_en: string | null;
  /** "" only on screen, before she has picked one: an event is not created without it. */
  date: string;
  /** "HH:MM", or NULL when she has not announced an hour. */
  time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  map_link: string | null;
  price: number;
  currency: string;
  /** NULL or 0 means sold out: waiting list only. */
  max_participants: number | null;
  image_url: string | null;
  whatsapp_group_link: string | null;
}

/** Fields that lock once a published event has ended. */
export const LOCKED_WHEN_ENDED = ["date", "time", "end_date", "end_time", "price", "currency", "max_participants"] as const;

/**
 * The editor's fields from a stored row. Times come back from Postgres as
 * "18:30:00" and the time input shows "18:30"; trimmed here, so reopening an
 * event does not count as a change.
 */
export function eventFieldsOf(row: Partial<Record<(typeof EVENT_FIELDS)[number], unknown>>): EventFields {
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  const hhmm = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 5) : null);
  return {
    slug: text(row.slug) ?? "",
    title_ro: text(row.title_ro) ?? "",
    title_en: text(row.title_en),
    description_ro: text(row.description_ro),
    description_en: text(row.description_en),
    date: text(row.date) ?? "",
    time: hhmm(row.time),
    end_date: text(row.end_date),
    end_time: hhmm(row.end_time),
    location: text(row.location),
    map_link: text(row.map_link),
    price: typeof row.price === "number" ? row.price : Number(row.price ?? 0) || 0,
    currency: text(row.currency) ?? DEFAULT_CURRENCY,
    max_participants:
      row.max_participants === null || row.max_participants === undefined ? null : Number(row.max_participants),
    image_url: text(row.image_url),
    whatsapp_group_link: text(row.whatsapp_group_link),
  };
}

/**
 * Whether the end is before the start, by the database's rule
 * (`events_ends_after_start`): a blank end date means the day it starts, a
 * blank start time counts as midnight.
 */
export function endsBeforeStart(f: Pick<EventFields, "date" | "time" | "end_date" | "end_time">): boolean {
  if (!f.date) return false;
  const lastDay = f.end_date || f.date;
  return lastDay < f.date || (lastDay === f.date && f.end_time !== null && f.end_time <= (f.time ?? "00:00"));
}

/**
 * What Publish needs: a title, a valid address and a date. Returns the first
 * thing missing, as a key under admin.event_editor.
 */
export function eventPublishProblem(f: EventFields): string | null {
  if (!f.title_ro.trim()) return "need_title";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug)) return "need_slug";
  if (!f.date) return "need_date";
  if (endsBeforeStart(f)) return "need_end";
  return null;
}

/** An event in the admin list: its row without the text, its numbers, and when its private changes were saved. */
export type ListedEvent = Pick<
  EventRow,
  | "id"
  | "slug"
  | "title_ro"
  | "title_en"
  | "date"
  | "time"
  | "end_date"
  | "end_time"
  | "location"
  | "price"
  | "currency"
  | "max_participants"
  | "image_url"
  | "published"
  | "starts_at"
  | "ends_at"
  | "show_in_archive"
  | "created_at"
  | "updated_at"
> & {
  draft_updated_at: string | null;
  overview: EventOverview | null;
};

/**
 * Every event with its numbers. A solo instructor runs tens of events a year,
 * so the list filters, sorts and pages them in the browser, and every tab's
 * count stays exact without a query per tab.
 */
export async function listEvents(): Promise<ListedEvent[]> {
  const supabase = createClient();
  const [events, overview] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, slug, title_ro, title_en, date, time, end_date, end_time, location, price, currency, max_participants, image_url, published, starts_at, ends_at, show_in_archive, created_at, updated_at, content_drafts(updated_at)"
      ),
    supabase.from("admin_event_overview").select("*"),
  ]);
  const byId = new Map((must(overview) ?? []).map((row) => [row.event_id, row]));
  return (must(events) ?? []).map(({ content_drafts, ...event }) => ({
    ...event,
    draft_updated_at: content_drafts?.updated_at ?? null,
    overview: byId.get(event.id) ?? null,
  }));
}

export function eventStatus(event: Pick<ListedEvent, "overview" | "published">): EventStatus {
  const status = event.overview?.status as EventStatus | undefined;
  return status ?? (event.published ? "upcoming" : "draft");
}

/** An event, its private changes and its numbers, for the editor. Null when there is no such event. */
export async function loadEvent(
  id: string
): Promise<{ event: EventRow; draft: Partial<EventFields> | null; overview: EventOverview | null } | null> {
  const supabase = createClient();
  const event = must(await supabase.from("events").select("*").eq("id", id).maybeSingle());
  if (!event) return null;
  const [draft, overview] = await Promise.all([
    supabase.from("content_drafts").select("data").eq("event_id", id).maybeSingle(),
    supabase.from("admin_event_overview").select("*").eq("event_id", id).maybeSingle(),
  ]);
  return {
    event,
    draft: (must(draft)?.data as Partial<EventFields> | undefined) ?? null,
    overview: must(overview) ?? null,
  };
}

/** A write that returns its row: the row, or an error if none came back. */
function one<T>(row: T): NonNullable<T> {
  if (!row) throw new AdminError("unknown", "The event was not returned; it may have been deleted.");
  return row;
}

/** Blank strings are NULL: the columns mean "not announced yet". */
function forDatabase(fields: Partial<EventFields>) {
  const out: Record<string, unknown> = { ...fields };
  for (const key of Object.keys(out)) {
    if (out[key] === "" && key !== "title_ro" && key !== "slug") out[key] = null;
  }
  return out as Database["public"]["Tables"]["events"]["Update"];
}

export async function createEvent(fields: EventFields, showInArchive: boolean): Promise<string> {
  const row = one(
    must(
      await createClient()
        .from("events")
        .insert({
          ...(forDatabase(fields) as Database["public"]["Tables"]["events"]["Insert"]),
          published: false,
          show_in_archive: showInArchive,
        })
        .select("id")
        .single()
    )
  );
  return row.id;
}

/** Writes changes to an event that has never been published. */
export async function updateEvent(id: string, changes: Partial<EventFields>): Promise<void> {
  must(await createClient().from("events").update(forDatabase(changes)).eq("id", id));
}

/** Saves the whole edited version of a live event as its private changes. */
export async function saveEventDraft(id: string, fields: EventFields): Promise<void> {
  must(
    await createClient()
      .from("content_drafts")
      .upsert({ event_id: id, data: forDatabase(fields) }, { onConflict: "event_id" })
  );
}

export async function discardEventDraft(id: string): Promise<void> {
  must(await createClient().from("content_drafts").delete().eq("event_id", id));
}

/** Publishes an event for the first time, with its fields as they are now. */
export async function publishNewEvent(id: string, fields: EventFields): Promise<EventRow> {
  return one(
    must(
      await createClient()
        .from("events")
        .update({ ...forDatabase(fields), published: true })
        .eq("id", id)
        .select("*")
        .single()
    )
  );
}

/** Publishes a live event's private changes. */
export async function publishEventChanges(id: string): Promise<EventRow> {
  const supabase = createClient();
  must(await supabase.rpc("publish_event_draft", { p_event_id: id }));
  return one(must(await supabase.from("events").select("*").eq("id", id).single()));
}

export async function setShowInArchive(id: string, value: boolean): Promise<void> {
  must(await createClient().from("events").update({ show_in_archive: value }).eq("id", id));
}

export async function deleteEvent(id: string): Promise<void> {
  must(await createClient().from("events").delete().eq("id", id));
}

/** Whether another event already has this address (for a live event's private changes). */
export async function eventSlugInUse(slug: string, exceptId: string): Promise<boolean> {
  const rows = must(await createClient().from("events").select("id").eq("slug", slug).neq("id", exceptId).limit(1));
  return (rows ?? []).length > 0;
}

/**
 * Where each of the five numbers leads: Registrations, filtered to this event
 * and that group.
 */
export type ParticipantFilter = "waitlist" | "pending" | "refund_requested" | "offers" | "refunded";

export function participantsHref(eventId: string, filter?: ParticipantFilter): string {
  const params = new URLSearchParams({ event: eventId });
  if (filter) params.set("status", filter);
  return `/admin/registrations?${params}`;
}
