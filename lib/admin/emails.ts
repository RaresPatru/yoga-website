import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { AdminError, must } from "@/lib/admin/db";
import { getAuthToken } from "@/lib/get-auth-token";
import type { EmailLocale, TemplateType } from "@/lib/email-content";
import { loadEmailSettings, type EmailSettings } from "@/lib/email-brand";
import { loadSampleEvent, type CardEventRow } from "@/lib/email-preview";
import { exclusions, resolveAudience, type Audience, type AudiencePerson, type ExclusionReason } from "@/lib/announcement-audience";

/**
 * Reading and writing the emails from the admin (/admin/emails): the
 * automatic emails' texts, announcements, and the requests that send (a
 * test to her, an announcement to its recipients).
 */

export type TemplateRow = Database["public"]["Tables"]["email_templates"]["Row"];
export type AnnouncementRow = Database["public"]["Tables"]["announcements"]["Row"];
export type AnnouncementListRow = Database["public"]["Views"]["admin_announcements"]["Row"];
export type RecipientRow = Database["public"]["Tables"]["announcement_recipients"]["Row"];

/** An email's four texts, as she edits them. English left blank means "send the Romanian". */
export interface EmailTexts {
  subject_ro: string;
  subject_en: string;
  body_ro: string;
  body_en: string;
}

export function textsOf(row: Pick<TemplateRow, "subject_ro" | "subject_en" | "body_ro" | "body_en">): EmailTexts {
  return {
    subject_ro: row.subject_ro ?? "",
    subject_en: row.subject_en ?? "",
    body_ro: row.body_ro ?? "",
    body_en: row.body_en ?? "",
  };
}

/** What is stored: English left blank becomes NULL. */
function storedTexts(texts: EmailTexts) {
  return {
    subject_ro: texts.subject_ro.trim(),
    subject_en: texts.subject_en.trim() || null,
    body_ro: texts.body_ro,
    body_en: texts.body_en.trim() ? texts.body_en : null,
  };
}

// ---------------------------------------------------------------------------
// The automatic emails
// ---------------------------------------------------------------------------

export async function listTemplates(): Promise<TemplateRow[]> {
  return must(await createClient().from("email_templates").select("*")) ?? [];
}

export async function loadTemplateRow(type: TemplateType): Promise<TemplateRow | null> {
  return must(await createClient().from("email_templates").select("*").eq("type", type).maybeSingle());
}

export async function saveTemplateTexts(type: TemplateType, texts: EmailTexts): Promise<void> {
  const rows = must(await createClient().from("email_templates").update(storedTexts(texts)).eq("type", type).select("id"));
  if (!rows?.length) throw new AdminError("unknown", `No '${type}' email template to save`);
}

// ---------------------------------------------------------------------------
// What a preview needs
// ---------------------------------------------------------------------------

export type SampleEvent = NonNullable<Awaited<ReturnType<typeof loadSampleEvent>>>;

/**
 * The layout's name, logo and footer, and the event a preview is filled from.
 * The site's address is this page's own: the panel is on the site.
 */
export async function loadPreviewContext(): Promise<{ settings: EmailSettings; event: SampleEvent | null }> {
  const supabase = createClient();
  const [settings, event] = await Promise.all([
    loadEmailSettings(supabase, window.location.origin),
    loadSampleEvent(supabase),
  ]);
  return { settings, event };
}

/** Events she can put in an announcement as cards: published, not yet over, soonest first. */
export async function eventsForCards(): Promise<CardEventRow[]> {
  return (
    must(
      await createClient()
        .from("events")
        .select("id, slug, title_ro, title_en, date, time, end_date, end_time, location, price, currency, image_url, published")
        .eq("published", true)
        .gt("ends_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
    ) ?? []
  );
}

// ---------------------------------------------------------------------------
// Requests to the server
// ---------------------------------------------------------------------------

/** A refusal the server gave, with its code, for the page to explain. */
export class EmailRequestError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(`Email request refused: ${code}`);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getAuthToken()}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw new AdminError("session", "Not signed in as the admin");
  if (!response.ok) throw new EmailRequestError(typeof data.code === "string" ? data.code : "failed", response.status);
  return data as T;
}

/** "Trimite-mi un test": the text on screen, to her own address. Answers the address. */
export async function sendTest(
  test:
    | { kind: "template"; type: TemplateType; locale: EmailLocale; subject: string; body: string }
    | { kind: "announcement"; locale: EmailLocale; subject: string; body: string; name?: string }
): Promise<string> {
  const { to } = await post<{ to: string }>("/api/admin/emails/test", test);
  return to;
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export async function listAnnouncements(): Promise<AnnouncementListRow[]> {
  return must(await createClient().from("admin_announcements").select("*").order("created_at", { ascending: false })) ?? [];
}

export async function createAnnouncement(audience: Audience): Promise<string> {
  const row = must(
    await createClient()
      .from("announcements")
      .insert({ audience: audience as unknown as Database["public"]["Tables"]["announcements"]["Insert"]["audience"] })
      .select("id")
      .single()
  );
  if (!row) throw new AdminError("unknown", "The announcement was not created");
  return row.id;
}

export async function loadAnnouncement(id: string): Promise<AnnouncementListRow | null> {
  return must(await createClient().from("admin_announcements").select("*").eq("id", id).maybeSingle());
}

/** Saves a draft's texts. A sent announcement is not changed. */
export async function saveAnnouncementTexts(id: string, texts: EmailTexts): Promise<void> {
  const rows = must(
    await createClient().from("announcements").update(storedTexts(texts)).eq("id", id).eq("status", "draft").select("id")
  );
  if (!rows?.length) throw new AdminError("invalid", "Only a draft can be changed");
}

export async function setAnnouncementAudience(id: string, audience: Audience): Promise<void> {
  const rows = must(
    await createClient()
      .from("announcements")
      .update({ audience: audience as unknown as Database["public"]["Tables"]["announcements"]["Update"]["audience"] })
      .eq("id", id)
      .eq("status", "draft")
      .select("id")
  );
  if (!rows?.length) throw new AdminError("invalid", "Only a draft's recipients can be changed");
}

export async function deleteAnnouncement(id: string): Promise<void> {
  must(await createClient().from("announcements").delete().eq("id", id));
}

export async function announcementRecipients(id: string): Promise<RecipientRow[]> {
  const supabase = createClient();
  const out: RecipientRow[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(
      await supabase
        .from("announcement_recipients")
        .select("*")
        .eq("announcement_id", id)
        .order("full_name")
        .range(from, from + 999)
    );
    out.push(...(page ?? []));
    if (!page || page.length < 1000) return out;
  }
}

export interface SendReport {
  sent: number;
  failed: number;
  excluded: number;
}

export async function sendAnnouncementNow(id: string, retry = false): Promise<SendReport> {
  return post<SendReport>(`/api/admin/announcements/${id}/send`, { retry });
}

/** The people an audience reaches, as the server will decide them, read with her session. */
export async function previewAudience(audience: Audience): Promise<AudiencePerson[]> {
  return resolveAudience(createClient(), audience);
}

/** Whether an announcement would reach this address now, and if not, why. */
export async function announcementVerdict(email: string): Promise<"included" | ExclusionReason> {
  const key = email.trim().toLowerCase();
  const verdicts = await exclusions(createClient(), [key]);
  return verdicts.get(key) ?? "included";
}

/**
 * She stops announcements to someone who asked another way (a message, in
 * person): their address joins the suppression list, as if they had pressed
 * the link. Ticking the box again on a later booking is a new yes.
 */
export async function stopAnnouncements(email: string): Promise<void> {
  must(
    await createClient()
      .from("email_suppressions")
      .upsert(
        { email: email.trim().toLowerCase(), reason: "admin", announcement_id: null, created_at: new Date().toISOString() },
        { onConflict: "email" }
      )
  );
}
