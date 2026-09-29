import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { must } from "@/lib/admin/db";
import { containsPattern } from "@/lib/search-text";

/**
 * Reading and changing the contact form's messages from the Mesaje page
 * (/admin/messages). Everything goes through her own session, so the
 * table's admin-only policy decides; nothing here needs the server.
 *
 * The database filters, searches and pages the list, 25 to a page, as it
 * does for Registrations: messages only pile up until she deletes them.
 *
 *   inbox    Not archived. New messages arrive here.
 *   starred  Starred, wherever they are, archived or not.
 *   archive  Archived, kept until she deletes them.
 *
 * "unread" narrows any tab to the messages she has not opened.
 */

export type InboxTab = "inbox" | "starred" | "archive";
export const INBOX_TABS: readonly InboxTab[] = ["inbox", "starred", "archive"];
export const PER_PAGE = 25;

export interface InboxFilters {
  tab: InboxTab;
  unread: boolean;
  q: string;
}

export interface Message {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  /** The language of the page they wrote from, and so of the reply. */
  locale: "ro" | "en";
  createdAt: string;
  readAt: string | null;
  starred: boolean;
  archivedAt: string | null;
}

type Row = Pick<
  Database["public"]["Tables"]["contact_messages"]["Row"],
  "id" | "name" | "email" | "subject" | "message" | "locale" | "created_at" | "read_at" | "starred" | "archived_at"
>;

const COLUMNS = "id, name, email, subject, message, locale, created_at, read_at, starred, archived_at";

function messageOf(row: Row): Message {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    locale: row.locale === "en" ? "en" : "ro",
    createdAt: row.created_at,
    readAt: row.read_at,
    starred: row.starred,
    archivedAt: row.archived_at,
  };
}

type Filterable<Q> = Q & {
  is: (column: string, value: null) => Filterable<Q>;
  not: (column: string, operator: string, value: null) => Filterable<Q>;
  eq: (column: string, value: boolean) => Filterable<Q>;
  ilike: (column: string, pattern: string) => Filterable<Q>;
  lte: (column: string, value: string) => Filterable<Q>;
};

/** A tab, the unread switch and the search, applied to any query on the table. */
function narrowed<Q>(query: Filterable<Q>, f: InboxFilters, tab: InboxTab): Filterable<Q> {
  let q = query;
  if (tab === "inbox") q = q.is("archived_at", null);
  if (tab === "archive") q = q.not("archived_at", "is", null);
  if (tab === "starred") q = q.eq("starred", true);
  if (f.unread) q = q.is("read_at", null);
  const pattern = containsPattern(f.q);
  if (pattern) q = q.ilike("search_text", pattern);
  return q;
}

export interface InboxPage {
  rows: Message[];
  /** Everything the current tab holds with this search, across pages. */
  total: number;
  /** What each tab would hold with the same search and unread switch. */
  counts: Record<InboxTab, number>;
  /** The unread ones among what the current tab holds with this search. */
  unread: number;
  /**
   * When the newest message had arrived, as the list was read. "All N that
   * match" means those she was shown: one that arrives while she is
   * choosing is not archived or deleted along with them.
   */
  asOf: string | null;
}

export async function listMessages(f: InboxFilters, page: number): Promise<InboxPage> {
  const supabase = createClient();
  const from = (page - 1) * PER_PAGE;
  const count = (tab: InboxTab, unread = f.unread) =>
    narrowed(supabase.from("contact_messages").select("id", { count: "exact", head: true }), { ...f, unread }, tab);

  const [rows, inbox, starred, archive, unread, newest] = await Promise.all([
    narrowed(supabase.from("contact_messages").select(COLUMNS, { count: "exact" }), f, f.tab)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + PER_PAGE - 1),
    count("inbox"),
    count("starred"),
    count("archive"),
    count(f.tab, true),
    supabase.from("contact_messages").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const result of [rows, inbox, starred, archive, unread, newest]) {
    if (result.error) throw result.error;
  }
  return {
    rows: (rows.data ?? []).map(messageOf),
    total: rows.count ?? 0,
    counts: { inbox: inbox.count ?? 0, starred: starred.count ?? 0, archive: archive.count ?? 0 },
    unread: unread.count ?? 0,
    asOf: newest.data?.created_at ?? null,
  };
}

/** PostgREST answers at most 1,000 rows at a time, so a long list is read in pages. */
const CHUNK = 1000;

/** Every message matching the filters that had arrived by `asOf`, for "all N that match". */
export async function allMatchingIds(f: InboxFilters, asOf: string): Promise<string[]> {
  const supabase = createClient();
  const ids: string[] = [];
  for (let from = 0; ; from += CHUNK) {
    const chunk = must(
      await narrowed(supabase.from("contact_messages").select("id"), f, f.tab)
        .lte("created_at", asOf)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, from + CHUNK - 1)
    );
    ids.push(...(chunk ?? []).map((row) => row.id));
    if (!chunk || chunk.length < CHUNK) return ids;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One message, or null when there is none: deleted, or an address edited by hand. */
export async function loadMessage(id: string): Promise<Message | null> {
  // Postgres refuses anything that is not a uuid with an error; to the page
  // it is simply no such message.
  if (!UUID.test(id)) return null;
  const row = must(await createClient().from("contact_messages").select(COLUMNS).eq("id", id).maybeSingle());
  return row ? messageOf(row) : null;
}

/** Opening a message marks it read; one she already read keeps its time. */
export async function markOpened(id: string): Promise<void> {
  must(
    await createClient()
      .from("contact_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null)
  );
}

export type MessageChange = "read" | "unread" | "star" | "unstar" | "archive" | "inbox";

const CHANGES: Record<MessageChange, () => Database["public"]["Tables"]["contact_messages"]["Update"]> = {
  read: () => ({ read_at: new Date().toISOString() }),
  unread: () => ({ read_at: null }),
  star: () => ({ starred: true }),
  unstar: () => ({ starred: false }),
  archive: () => ({ archived_at: new Date().toISOString() }),
  inbox: () => ({ archived_at: null }),
};

/** A hundred ids to a request keeps each address well under any length limit. */
const IDS_PER_REQUEST = 100;

/** Applies one change to the given messages; answers how many there were. */
export async function changeMessages(ids: string[], change: MessageChange): Promise<number> {
  const supabase = createClient();
  let changed = 0;
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    const rows = must(
      await supabase
        .from("contact_messages")
        .update(CHANGES[change]())
        .in("id", ids.slice(i, i + IDS_PER_REQUEST))
        .select("id")
    );
    changed += rows?.length ?? 0;
  }
  return changed;
}

/** Deletes the given messages for good; answers how many went. */
export async function deleteMessages(ids: string[]): Promise<number> {
  const supabase = createClient();
  let deleted = 0;
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    const rows = must(
      await supabase.from("contact_messages").delete().in("id", ids.slice(i, i + IDS_PER_REQUEST)).select("id")
    );
    deleted += rows?.length ?? 0;
  }
  return deleted;
}

/**
 * The reply's own words, in the language of the message rather than of the
 * panel: they go to the person who wrote.
 */
const REPLY = {
  ro: { subject: "Mesajul tău către {site}", plainSubject: "Mesajul tău", wrote: "Pe {date}, {name} a scris:" },
  en: { subject: "Your message to {site}", plainSubject: "Your message", wrote: "On {date}, {name} wrote:" },
} as const;

/**
 * The longest mailto: address handed to the mail app. Some cut or refuse
 * longer ones (Outlook on Windows, notably, near 2,000 characters), and a
 * Romanian letter takes six characters once encoded.
 */
const MAILTO_MAX = 1800;

/**
 * "Răspunde prin email": a mailto: address that opens her mail app with the
 * sender, "Re: <their subject>", and their message quoted underneath, as a
 * mail app quotes a reply. They wrote through a form, so without the quote
 * the reply would reach them with nothing to say what it answers.
 *
 * A long message is quoted from the start for as much as fits, and marked as
 * cut. `writtenOn` is when they wrote, already in the message's language.
 */
export function replyHref(message: Message, siteName: string, writtenOn: string): string {
  const words = REPLY[message.locale];
  const subject = message.subject?.trim()
    ? `Re: ${message.subject.trim()}`
    : siteName
      ? words.subject.replace("{site}", siteName)
      : words.plainSubject;
  const heading = words.wrote.replace("{date}", writtenOn).replace("{name}", message.name);
  // The address as typed, with anything that would end it early (?, &, #)
  // encoded; the @ stays readable, as every mail app expects.
  const to = encodeURIComponent(message.email).replace(/%40/g, "@");

  const href = (text: string, cut: boolean) => {
    const quoted = text
      .split(/\r?\n/)
      .map((line) => (line.trim() ? `> ${line}` : ">"))
      .concat(cut ? ["> […]"] : []);
    // RFC 6068: line breaks in a mailto: body are CRLF.
    const body = ["", "", heading, ...quoted].join("\r\n");
    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const full = href(message.message, false);
  if (full.length <= MAILTO_MAX) return full;
  // Cut by characters, not UTF-16 units: half an emoji would make
  // encodeURIComponent throw.
  const characters = Array.from(message.message);
  for (let keep = Math.floor(characters.length * 0.8); keep > 0; keep = Math.floor(keep * 0.8)) {
    const shorter = href(characters.slice(0, keep).join("").trimEnd(), true);
    if (shorter.length <= MAILTO_MAX) return shorter;
  }
  return href("", true);
}
