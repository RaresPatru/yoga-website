import { searchable } from "@/lib/search-text";

/**
 * The Registrations page's filters, as rules any query on `admin_participants`
 * can take: the page's list in the browser, and the server working out who an
 * announcement goes to. One definition, so "everyone matching this filter"
 * means the same people on the page and in the send.
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

export type Filterable<Q> = Q & {
  eq: (column: string, value: string | boolean) => Filterable<Q>;
  ilike: (column: string, pattern: string) => Filterable<Q>;
};

/** The filters, applied to any query on the view. The tab is optional so the two counts can share it. */
export function narrowed<Q>(query: Filterable<Q>, f: ParticipantFilters, tab: ParticipantTab | null): Filterable<Q> {
  let q = query;
  if (tab) q = q.eq("archived", tab === "archive");
  if (f.status) q = q.eq("status", f.status);
  if (f.eventId) q = q.eq("event_id", f.eventId);
  const pattern = searchPattern(f.q);
  if (pattern) q = q.ilike("search_text", pattern);
  return q;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filters read back from stored JSON, with anything unexpected dropped. */
export function parseFilters(value: unknown): ParticipantFilters {
  const raw = (value ?? {}) as Record<string, unknown>;
  const status = typeof raw.status === "string" && (STATUS_FILTERS as readonly string[]).includes(raw.status)
    ? (raw.status as ParticipantStatus)
    : null;
  return {
    tab: raw.tab === "archive" ? "archive" : "active",
    status,
    eventId: typeof raw.eventId === "string" && UUID.test(raw.eventId) ? raw.eventId : null,
    q: typeof raw.q === "string" ? raw.q.slice(0, 200) : "",
  };
}
