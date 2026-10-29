import { containsPattern } from "@/lib/search-text";

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
  | "cancelled"
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
  "cancelled",
  "waitlist",
  "offers",
  "removed",
  "abandoned",
];

/**
 * Two more choices in the status menu, about discount codes rather than the
 * booking (Rares, 5 October 2026): people an announcement carried a code to,
 * and bookings paid with one. Not statuses of a row — someone can have paid
 * and used a code — so they sit beside the status rather than replacing it,
 * in the menu and on the row.
 */
export type CodeFilter = "code_received" | "code_used";

export const CODE_FILTERS: readonly CodeFilter[] = ["code_received", "code_used"];

/** What the status menu can choose: a status, or one of the code filters. */
export type StatusFilter = ParticipantStatus | CodeFilter;

export const isStatusFilter = (value: unknown): value is StatusFilter =>
  typeof value === "string" &&
  ((STATUS_FILTERS as readonly string[]).includes(value) || (CODE_FILTERS as readonly string[]).includes(value));

export type ParticipantTab = "active" | "archive";

export interface ParticipantFilters {
  tab: ParticipantTab;
  status: StatusFilter | null;
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
  return containsPattern(trimmed);
}

export type Filterable<Q> = Q & {
  eq: (column: string, value: string | boolean) => Filterable<Q>;
  ilike: (column: string, pattern: string) => Filterable<Q>;
};

/** The filters, applied to any query on the view. The tab is optional so the two counts can share it. */
export function narrowed<Q>(query: Filterable<Q>, f: ParticipantFilters, tab: ParticipantTab | null): Filterable<Q> {
  let q = query;
  if (tab) q = q.eq("archived", tab === "archive");
  if (f.status === "code_received" || f.status === "code_used") q = q.eq(f.status, true);
  else if (f.status) q = q.eq("status", f.status);
  if (f.eventId) q = q.eq("event_id", f.eventId);
  const pattern = searchPattern(f.q);
  if (pattern) q = q.ilike("search_text", pattern);
  return q;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filters read back from stored JSON, with anything unexpected dropped. */
export function parseFilters(value: unknown): ParticipantFilters {
  const raw = (value ?? {}) as Record<string, unknown>;
  const status = isStatusFilter(raw.status) ? raw.status : null;
  return {
    tab: raw.tab === "archive" ? "archive" : "active",
    status,
    eventId: typeof raw.eventId === "string" && UUID.test(raw.eventId) ? raw.eventId : null,
    q: typeof raw.q === "string" ? raw.q.slice(0, 200) : "",
  };
}
