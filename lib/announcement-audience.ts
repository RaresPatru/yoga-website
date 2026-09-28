import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { narrowed, parseFilters, type ParticipantFilters } from "@/lib/participant-filters";

/**
 * Who an announcement goes to, and who is left out and why.
 *
 * She chooses people on the Registrations page: the rows she ticked, everyone
 * matching a filter, or everyone. Those are rows, one per booking or
 * waiting-list entry, so one person can be several of them; an announcement
 * goes once per email address, addressed with the name and in the language
 * of their latest row.
 *
 * WHO IS INCLUDED
 *
 * Only someone who ticked "send me news about future events" on some booking
 * or waiting-list entry (marketing_consent_at). Promotional email needs that
 * yes (Romanian Law 506/2004, art. 12), and it is a yes to hearing about
 * events, not about one event, so any of their rows counts, not only the
 * rows she chose.
 *
 * Unless they unsubscribed since: an address on email_suppressions is left
 * out, unless they ticked the box again on a booking made after they
 * unsubscribed.
 *
 * Takes a Supabase client rather than making one: the editor shows who will
 * receive it with her session, and the server decides with its own key when
 * it sends, by the same rule.
 */

export type Audience =
  | { kind: "all" }
  | { kind: "ids"; ids: string[] }
  | { kind: "filter"; filters: ParticipantFilters };

export type ExclusionReason = "no_consent" | "unsubscribed";

export interface AudiencePerson {
  /** Lowercased: one announcement per address. */
  email: string;
  fullName: string;
  locale: "ro" | "en";
  included: boolean;
  reason: ExclusionReason | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The most rows a single audience can list, and so a ceiling on one send. */
export const MAX_IDS = 5000;

/** An audience read back from stored JSON, with anything unexpected dropped. */
export function parseAudience(value: unknown): Audience {
  const raw = (value ?? {}) as Record<string, unknown>;
  if (raw.kind === "ids" && Array.isArray(raw.ids)) {
    return { kind: "ids", ids: raw.ids.filter((id): id is string => typeof id === "string" && UUID.test(id)).slice(0, MAX_IDS) };
  }
  if (raw.kind === "filter") return { kind: "filter", filters: parseFilters(raw.filters) };
  return { kind: "all" };
}

type Client = SupabaseClient<Database>;

interface Row {
  email_key: string | null;
  full_name: string | null;
  locale: string | null;
  created_at: string | null;
}

const COLUMNS = "email_key, full_name, locale, created_at";
/** PostgREST answers at most a thousand rows at a time. */
const PAGE = 1000;
/** Ids or addresses per request, well under any address-length limit. */
const IN_CHUNK = 100;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function rowsOf(supabase: Client, audience: Audience): Promise<Row[]> {
  if (audience.kind === "ids") {
    const rows: Row[] = [];
    for (const ids of chunks(audience.ids, IN_CHUNK)) {
      const { data, error } = await supabase.from("admin_participants").select(COLUMNS).in("id", ids);
      if (error) throw error;
      rows.push(...(data ?? []));
    }
    return rows;
  }

  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const query = supabase.from("admin_participants").select(COLUMNS);
    const filtered = audience.kind === "filter" ? narrowed(query, audience.filters, audience.filters.tab) : query;
    const { data, error } = await filtered
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** A timestamp as a number to compare, or null. */
function instant(value: string | null | undefined): number | null {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? null : time;
}

export async function resolveAudience(supabase: Client, audience: Audience): Promise<AudiencePerson[]> {
  const rows = await rowsOf(supabase, audience);

  // One person per address: the name and language of their latest row.
  const people = new Map<string, { fullName: string; locale: "ro" | "en"; createdAt: string }>();
  for (const row of rows) {
    const email = row.email_key?.trim();
    if (!email) continue;
    const seen = people.get(email);
    if (!seen || (row.created_at ?? "") > seen.createdAt) {
      people.set(email, {
        fullName: row.full_name ?? "",
        locale: row.locale === "en" ? "en" : "ro",
        createdAt: row.created_at ?? "",
      });
    }
  }
  const emails = [...people.keys()];
  const verdicts = await exclusions(supabase, emails);

  return emails
    .map((email): AudiencePerson => {
      const person = people.get(email)!;
      const reason = verdicts.get(email) ?? null;
      return { email, fullName: person.fullName, locale: person.locale, included: reason === null, reason };
    })
    .sort((a, b) => Number(b.included) - Number(a.included) || a.fullName.localeCompare(b.fullName, "ro"));
}

/**
 * The rule, for a list of addresses: null for someone an announcement may go
 * to, else why not. Their latest yes is looked for on every row of theirs,
 * whichever event it was, and it has to be newer than any unsubscribe. The
 * server asks again just before each group of emails leaves, so someone who
 * unsubscribes while an announcement is going out is not written to.
 */
export async function exclusions(supabase: Client, emails: string[]): Promise<Map<string, ExclusionReason | null>> {
  const consent = new Map<string, number>();
  const unsubscribed = new Map<string, number>();

  for (const batch of chunks(emails, IN_CHUNK)) {
    const [yes, stopped] = await Promise.all([
      supabase
        .from("admin_participants")
        .select("email_key, marketing_consent_at")
        .in("email_key", batch)
        .not("marketing_consent_at", "is", null),
      supabase.from("email_suppressions").select("email, created_at").in("email", batch),
    ]);
    if (yes.error) throw yes.error;
    if (stopped.error) throw stopped.error;
    for (const row of yes.data ?? []) {
      const time = instant(row.marketing_consent_at);
      if (row.email_key && time !== null && time > (consent.get(row.email_key) ?? -Infinity)) {
        consent.set(row.email_key, time);
      }
    }
    for (const row of stopped.data ?? []) {
      const time = instant(row.created_at);
      if (time !== null) unsubscribed.set(row.email, time);
    }
  }

  const verdicts = new Map<string, ExclusionReason | null>();
  for (const email of emails) {
    const yes = consent.get(email);
    const stopped = unsubscribed.get(email);
    verdicts.set(email, yes === undefined ? "no_consent" : stopped !== undefined && stopped >= yes ? "unsubscribed" : null);
  }
  return verdicts;
}
